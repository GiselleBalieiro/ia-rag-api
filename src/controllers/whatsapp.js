import Baileys from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  proto, 
  initAuthCreds, 
  BufferJSON 
} = Baileys;

import { useMongoDBAuthState } from './mongoAuthState.js';
import Pino from 'pino';
import qrcode from 'qrcode';
import axios from 'axios';
import { MongoClient } from 'mongodb';
import { Boom } from '@hapi/boom';

import { buscarAgentesParaRestaurar, getOwnerPhone } from './function.js';
import {
  blockNumber,
  unblockNumber,
  isNumberBlocked,
  getBlockInfo,
  detectHumanRequest,
} from './blockedNumbers.js';

const MONGO_URL = process.env.MONGO_URL;
let mongoClient;
let whatsappStatusMap = {};
const activeSockets = {};
const connectingAgents = new Map(); 
const aiSentMessages = new Map();

const conversationHistory = new Map();
const MAX_HISTORY_PER_USER = 10;
const conversationHistoryTimestamps = new Map(); 
const HISTORY_CLEANUP_INTERVAL = 30 * 60 * 1000; 
const HISTORY_MAX_AGE = 2 * 60 * 60 * 1000; 

function cleanupOldHistories() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, timestamp] of conversationHistoryTimestamps.entries()) {
    if (now - timestamp > HISTORY_MAX_AGE) {
      conversationHistory.delete(key);
      conversationHistoryTimestamps.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Limpeza] ${cleaned} históricos antigos removidos. Memória: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
  }
}

function cleanupOldStatuses() {
  let cleaned = 0;

  for (const id in whatsappStatusMap) {

    if (!activeSockets[id] && whatsappStatusMap[id]?.status === 'desconectado') {
      delete whatsappStatusMap[id];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Limpeza] ${cleaned} status obsoletos removidos.`);
  }
}

function cleanupStaleLocks() {
  const now = Date.now();
  const MAX_LOCK_AGE = 5 * 60 * 1000; 
  let cleaned = 0;

  for (const [id, timestamp] of connectingAgents.entries()) {
    if (now - timestamp > MAX_LOCK_AGE) {
      connectingAgents.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Limpeza] ${cleaned} locks de conexão travados removidos.`);
  }
}

setInterval(() => {
  cleanupOldHistories();
  cleanupOldStatuses();
  cleanupStaleLocks();
}, HISTORY_CLEANUP_INTERVAL);

async function getMongoClient() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URL, {
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000, 
      maxPoolSize: 50, 
      minPoolSize: 5, 
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    console.log('Conectado ao MongoDB Atlas (pool: 50 conexões)');
  }
  return mongoClient;
}

async function safeSendMessage(sock, id, jid, content) {
  try {
    const sentMsg = await sock.sendMessage(jid, content);
    if (sentMsg?.key?.id) aiSentMessages.set(sentMsg.key.id, Date.now());
    return sentMsg;
  } catch (err) {
    if (err.output?.statusCode === 408 || err.message?.includes('Timed Out')) {
      console.warn(`[${id}] Timeout ao enviar mensagem para ${jid}. Retentando...`);
      setTimeout(() => safeSendMessage(sock, id, jid, content), 3000);
    } else {
      console.error(`[${id}] Erro ao enviar mensagem:`, err.message || err);
    }
    return null;
  }
}

export function getWhatsappStatus(id) {
  return id ? whatsappStatusMap[id] || { status: 'desconectado', qr: null } : whatsappStatusMap;
}

export async function startWhatsApp(id, allowNewSession = true, attempt = 0) {
  if (activeSockets[id]) {
    console.log(`[${id}] Socket já existe e está ativo. Ignorando nova tentativa de conexão.`);
    return activeSockets[id];
  }

  if (connectingAgents.has(id)) {
    console.log(`[${id}] Conexão já em andamento. Ignorando nova tentativa (tentativa ${attempt}).`);
    return null;
  }

  connectingAgents.set(id, Date.now());
  console.log(`[${id}] Iniciando processo de conexão (tentativa ${attempt})...`);
  if (!MONGO_URL) {
    console.error(`[${id}] Variável MONGO_URL não configurada.`);
    if(whatsappStatusMap) {
      whatsappStatusMap[id] = { status: 'erro', qr: null, error: 'MONGO_URL não configurada.' };
    }
    connectingAgents.delete(id); 
    return;
  }

  let client;
  let collection;
  const dbName = 'baileys_sessions_db';

  try {
    client = await getMongoClient();
    collection = client.db(dbName).collection('sessions');
    
    console.log(`[${id}] Verificando sessão... DB: ${dbName}, Collection: sessions`);

    const doc = await collection.findOne({ _id: id });
    const sessionExists = (doc && doc.data); 

    if (!sessionExists && doc) {
      console.warn(`[${id}] Documento de sessão encontrado, mas está corrompido (formato antigo). Ignorando...`);
    }

    if (!sessionExists && !allowNewSession) {
      console.log(`[${id}] Sessão não encontrada ou corrompida. Pulando restauração (QR code não será gerado).`);
      if(whatsappStatusMap) {
          whatsappStatusMap[id] = { status: 'desconectado', qr: null, error: 'Sessão não registrada ou corrompida.' };
        }
      connectingAgents.delete(id); 
      return;
    }
    
    console.log(`[${id}] Iniciando... (Sessão ${sessionExists ? 'válida encontrada no DB' : 'será criada'}).`);

  } catch (err) {
    console.error(`[${id}] Erro CRÍTICO ao verificar sessão no DB:`, err.message);

    if(whatsappStatusMap) {
      whatsappStatusMap[id] = { status: 'erro', qr: null, error: `Erro no DB: ${err.message}` };
    }
    connectingAgents.delete(id); 
    return;
  }

  try {
    const { state, saveCreds, clearCreds } = await useMongoDBAuthState(collection, id);
    const { version } = await fetchLatestBaileysVersion();
    const logger = Pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.windows('Chrome'),
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 20000,
      retryRequestDelayMs: 1500,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      getMessage: async () => ({ conversation: '' }),
    });

    activeSockets[id] = sock;
    connectingAgents.delete(id); 
    if(whatsappStatusMap) {
      whatsappStatusMap[id] = { status: 'iniciando', qr: null };
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if(whatsappStatusMap) {
          whatsappStatusMap[id] = { status: 'qr', qr: await qrcode.toDataURL(qr) };
        }
        console.log(`QR gerado para agente ${id}`);
      }

      if (connection === 'open') {
        if(whatsappStatusMap) {
          whatsappStatusMap[id] = { status: 'conectado', qr: null };
        }
        console.log(`Conectado ao WhatsApp (${id})`);
        attempt = 0;
      }

      if (connection === 'close') {
        delete activeSockets[id];
        const reason = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        console.warn(`Conexão fechada (${id}), motivo: ${reason}`);
        if(whatsappStatusMap) {
          whatsappStatusMap[id] = { status: 'desconectado', qr: null };
        }

        if (reason === DisconnectReason.connectionReplaced) {
          console.log(`Conexão substituída (${id}).`);
          connectingAgents.delete(id); 
        } else if (reason === DisconnectReason.loggedOut) {
          await clearCreds();
          console.log(`Sessão encerrada permanentemente (${id}).`);
          if(whatsappStatusMap) {
            whatsappStatusMap[id] = { status: 'deslogado', qr: null, error: 'Usuário deslogado.' };
          }
          connectingAgents.delete(id); 
        } else if (reason === 408 || shouldReconnect) {
          const nextAttempt = attempt + 1;
          const delay = Math.min(30000, 2000 * Math.pow(2, attempt));
          if (nextAttempt <= 10) {
            console.log(`Reconnect ${id} em ${delay}ms (tentativa ${nextAttempt})`);

            setTimeout(() => startWhatsApp(id, allowNewSession, nextAttempt), delay);
          } else {
            console.error(`[${id}] Reconexão falhou após 10 tentativas.`);
            if(whatsappStatusMap) {
              whatsappStatusMap[id] = { status: 'erro', qr: null, error: 'Reconexão falhou' };
            }
            connectingAgents.delete(id);
          }
        }
      }
    });


    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async (msg) => {
        try {
            const message = msg.messages[0];
            if (!message.message) return;
            console.log(`[${id}] Mensagem recebida de ${message.key.remoteJid}`);

            const from = message.key.remoteJid;
            const isFromMe = message.key.fromMe;
            const messageId = message.key.id;
    
            const now = Date.now();
            for (const [id, timestamp] of aiSentMessages.entries()) {
              if (now - timestamp > 10000) {
                aiSentMessages.delete(id);
              }
            }
    
            if (isFromMe) {
    
              const isAiMessage = aiSentMessages.has(messageId);
    
              if (isAiMessage) {
                aiSentMessages.delete(messageId);
                return;
              }
    
              try {
                const ownerPhone = await getOwnerPhone(id);
                if (ownerPhone) {
    
                  const normalizedFrom = from.replace(/[^\d]/g, '');
                  const normalizedOwner = ownerPhone.replace(/[^\d]/g, '');
    
                  const isGroup = from.endsWith('@g.us');
                  const isStatus = from === 'status@broadcast';
                  const isOwnNumber = normalizedFrom.includes(normalizedOwner) || normalizedOwner.includes(normalizedFrom);
    
                  if (!isGroup && !isStatus && !isOwnNumber) {
                    const result = await blockNumber(
                      id,
                      from,
                      'owner_takeover',
                      '24hr',
                    );
                    if (result && result.success) {
                      console.log(
                        `[${id}] Dono assumiu atendimento com ${from} - IA bloqueada por 24h`,
                      );
                    }
                  }
                }
              } catch (err) {
                console.error(
                  `[${id}] Erro ao bloquear após dono assumir:`,
                  err.message,
                );
              }
              return;
            }
    
            const text =
              message.message.conversation ||
              message.message.extendedTextMessage?.text;
            if (!text) return;
    
            console.log(`[${id}] ${from}: ${text}`);
    
            // comando de bloqueio "###" ou "### <duração>"
            const blockCommandMatch = text
              .trim()
              .match(/^###\s*(\d+(?:hr|h|d|a|ano|anos)?)?$/i);
            if (blockCommandMatch) {
              try {
                const ownerPhone = await getOwnerPhone(id);
    
                if (!ownerPhone) {
                  console.warn(`Agente ${id} não tem number configurado`);
                  await safeSendMessage(sock, id, from, {
                    text: 'Não foi possível processar o comando. Configure o número do dono da conta.',
                  });
                  return;
                }
    
                const normalizedFrom = from.replace(/[^\d]/g, '');
                const normalizedOwner = ownerPhone.replace(/[^\d]/g, '');
    
                if (
                  normalizedFrom.includes(normalizedOwner) ||
                  normalizedOwner.includes(normalizedFrom)
                ) {
                  const duration = blockCommandMatch[1] || '24hr';
    
                  const result = await blockNumber(id, from, from, duration);
    
                  if (result && result.success) {
                    const blockedUntil =
                      result.blockedUntil.toLocaleString('pt-BR');
                    //  await sock.sendMessage(from, {
                    //    text: `IA desabilitada para este número por ${duration}.\n\nVocê não receberá mais respostas automáticas até ${blockedUntil}.\n\nPara reativar antes, envie: ##ativar`
                    //  });
                    console.log(
                      `Número ${from} bloqueado por ${duration} para agente ${id}`,
                    );
                  } else {
                    console.log(
                      'Não foi possível desabilitar a IA. Verifique o formato do comando.\n\nExemplos: ###, ### 1hr, ### 24hr, ### 7d, ### 1a',
                    );
                  }
                } else {
                  console.log(
                    `Tentativa de usar comando ### por não-dono: ${from}`,
                  );
                  await safeSendMessage(sock, id, from, {
                    text: 'Comando não reconhecido.',
                  });
                }
              } catch (err) {
                console.error('Erro ao processar comando ###:', err.message);
                await safeSendMessage(sock, id, from, {
                  text: 'Erro ao processar comando.',
                });
              }
              return;
            }
    
            if (text.trim() === '##ativar') {
              try {
                const ownerPhone = await getOwnerPhone(id);
    
                if (!ownerPhone) {
                  console.warn(`Agente ${id} não tem number configurado`);
                  return;
                }
    
                const normalizedFrom = from.replace(/[^\d]/g, '');
                const normalizedOwner = ownerPhone.replace(/[^\d]/g, '');
    
                if (
                  normalizedFrom.includes(normalizedOwner) ||
                  normalizedOwner.includes(normalizedFrom)
                ) {
                  const unblocked = await unblockNumber(id, from);
    
                  if (unblocked) {
                    console.log(`Número ${from} desbloqueado para agente ${id}`);
                  } else {
                    console.log('A IA já estava ativa.');
                  }
                } else {
                  await safeSendMessage(sock, id, from, {
                    text: 'Comando não reconhecido.',
                  });
                }
              } catch (err) {
                console.error('Erro ao processar comando ##ativar:', err.message);
              }
              return;
            }
    
            if (detectHumanRequest(text)) {
              try {
                console.log(`Solicitação de atendente humano detectada de ${from}`);
    
                const result = await blockNumber(id, from, 'system', '24hr');
    
                if (result && result.success) {
                  await safeSendMessage(sock, id, from, {
                    text: 'Entendido! Estou encerrando o atendimento automático.\n\nVocê será transferido(a) para o atendente em breve.',
                  });
                  console.log(
                    `Número ${from} bloqueado por 24hr (solicitação de atendente) para agente ${id}`,
                  );
                } else {
                  await safeSendMessage(sock, id, from, {
                    text: 'Vou transferir você para um atendente. Aguarde um momento, por favor.',
                  });
                }
              } catch (err) {
                console.error(
                  'Erro ao processar solicitação de atendente:',
                  err.message,
                );
                await safeSendMessage(sock, id, from, {
                  text: 'Vou transferir você para um atendente. Aguarde, por favor.',
                });
              }
              return;
            }
    
            try {
              const blocked = await isNumberBlocked(id, from);
    
              if (blocked) {
                const blockInfo = await getBlockInfo(id, from);
                if (blockInfo) {
                  const blockedUntil = new Date(blockInfo.blocked_until);
                  const hoursRemaining = Math.ceil(
                    (blockedUntil - new Date()) / (1000 * 60 * 60),
                  );
                  console.log(
                    `[${id}] Mensagem ignorada de ${from} (bloqueado por mais ${hoursRemaining}h)`,
                  );
    
                  const motivo =
                    blockInfo.blocked_by === 'system'
                      ? 'Solicitou atendente humano'
                      : blockInfo.blocked_by === 'owner_takeover'
                      ? 'Dono assumiu atendimento'
                      : 'Comando manual do dono';
    
                  console.log(`Motivo: ${motivo}`);
                }
                return;
              }
            } catch (err) {
              console.error(`[${id}] Erro ao verificar bloqueio:`, err.message);
            }
    
            try {
    
                const historyKey = from;
                let userHistory = conversationHistory.get(historyKey) || [];
    
                userHistory.push({ role: 'user', content: text });
    
                if (userHistory.length > MAX_HISTORY_PER_USER) {
                  userHistory = userHistory.slice(userHistory.length - MAX_HISTORY_PER_USER);
                }

                conversationHistoryTimestamps.set(historyKey, Date.now());
    
                const response = await axios.post(
                  'https://ia-rag-api.vercel.app/perguntar',
                  { 
                    pergunta: text,
                    id: id,  
                    userId: from, 
                    historico: userHistory 
                  },
                  { headers: { 'Content-Type': 'application/json' } },
                );
        
                const reply =
                  response.data.resposta ||
                  'Não consegui gerar uma resposta no momento.';
    
                userHistory.push({ role: 'assistant', content: reply });
    
                conversationHistory.set(historyKey, userHistory);
    
                await safeSendMessage(sock, id, from, { text: reply });
        
                console.log(`IA respondeu: ${reply}`);
        
              } catch (err) {
                console.error('Erro ao consultar IA:', err.message);
    
                await safeSendMessage(sock, id, from, {
                  text: 'Não consegui falar com o servidor da IA agora.',
                });
              }
          } catch (error) {
    
            if (error.message && error.message.includes('No sessions')) {
              console.error(
                `[${id}] Erro de sessão ao processar mensagem:`,
                error.message,
              );
              console.log(
                `[${id}] A sessão pode estar corrompida. Recomenda-se reconectar com QR Code.`,
              );
            } else {
              console.error(
                `[${id}] Erro ao processar mensagem:`,
                error.message || error,
              );
            }
          }
        });
    return sock;
  } catch (err) {
  	 console.error(`Erro ao iniciar WhatsApp (${id}):`, err?.message || err);
    if(whatsappStatusMap) {
  	   whatsappStatusMap[id] = { status: 'erro', qr: null, error: err?.message };
    }
  	 if (err.message?.includes('Timed Out')) {
  	 	 setTimeout(() => startWhatsApp(id, allowNewSession, attempt + 1), 5000);
    } else {
      connectingAgents.delete(id); 
    }
  }
}

export async function conectarWhatsApp(req, res) {
  try {
    const id = req.body.id;
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: 'ID é obrigatório.' });
    }

    if (activeSockets[id]) {
      const currentStatus = whatsappStatusMap[id]?.status || 'desconhecido';
      console.log(`[API] Agente ${id} já possui socket ativo (status: ${currentStatus})`);
      return res.json({
        success: true,
        message: `Agente ${id} já está ${currentStatus}. Consulte /status?id=${id} para detalhes.`,
        status: currentStatus
        });
    }

    if (connectingAgents.has(id)) {
      console.log(`[API] Agente ${id} já tem uma tentativa de conexão em andamento`);
      return res.json({
        success: true,
        message: `Agente ${id} já está sendo conectado. Aguarde ou consulte /status?id=${id}.`,
        status: 'conectando'
        });
    }

    console.log(`[API] Iniciando conexão para agente ${id} via API`);

    if(whatsappStatusMap) {
        whatsappStatusMap[id] = { status: 'iniciando', qr: null };
    }


    startWhatsApp(id, true);

    res.json({
      success: true,
      message: `Conexão iniciada para agente ${id}. Aguarde alguns segundos e consulte /status?id=${id} para ver o QR code ou status da conexão.`,
      endpoint: `/status?id=${id}`
    });
  } catch (err) {
    console.error(`[API] Erro ao conectar agente:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

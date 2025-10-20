import Baileys from '@whiskeysockets/baileys';

const {
    default: makeWASocket,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
} = Baileys;

import { useMongoDBAuthState } from './mongo-auth-store.js';

import Pino from 'pino';
import qrcode from 'qrcode';
import axios from 'axios';
import { MongoClient } from 'mongodb';
import { Boom } from '@hapi/boom'; 
import { buscarAgentesParaRestaurar } from './function.js';

const MONGO_URL = process.env.MONGO_URL;

let mongoClient;

let whatsappStatusMap = {};
const activeSockets = {};

export function getWhatsappStatus(id) {
  if (id) {
    return whatsappStatusMap[id] || { status: 'desconectado', qr: null };
  }
  return whatsappStatusMap;
}

export async function startWhatsApp(id, attempt = 0) {
  if (!MONGO_URL) {
      throw new Error("A variável de ambiente MONGO_URL não foi configurada na Vercel.");
  }

  if (!mongoClient) {
      mongoClient = new MongoClient(MONGO_URL, {});
      await mongoClient.connect();
      console.log("Conectado ao MongoDB Atlas.");
  }
  
  const collection = mongoClient.db("baileys_sessions_db").collection("sessions");

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
    });

    activeSockets[id] = sock;
    whatsappStatusMap[id] = { status: 'iniciando', qr: null };

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrBase64 = await qrcode.toDataURL(qr);
        whatsappStatusMap[id] = { status: 'qr', qr: qrBase64 };
        console.log(`QR gerado para agente ${id}`);
      }

      if (connection === 'open') {
        whatsappStatusMap[id] = { status: 'conectado', qr: null };
        console.log(`Conectado ao WhatsApp para agente ${id}`);
        attempt = 0;
      }

      if (connection === 'close') {
        delete activeSockets[id];

        const reason = lastDisconnect?.error?.output?.statusCode;
        console.warn(`Conexão fechada para agente ${id}, reason: ${reason}`);
        whatsappStatusMap[id] = { status: 'desconectado', qr: null };

        if (reason === DisconnectReason.connectionReplaced) {
          console.error(`CONEXÃO SUBSTITUÍDA para agente ${id}. Outra sessão foi aberta. Não vamos reconectar.`);
        
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(`Sessão encerrada permanentemente para agente ${id}. Requer novo QR Code.`);
          await clearCreds();
        
        } else {
          const nextAttempt = attempt + 1;
          const maxAttempts = 5;
          const delay = Math.min(30000, 2000 * Math.pow(2, attempt));

          if (nextAttempt <= maxAttempts) {
            console.log(
              `Tentando reconectar agente ${id} em ${delay}ms (tentativa ${nextAttempt})`,
            );
            setTimeout(() => startWhatsApp(id, nextAttempt), delay);
          } else {
            console.error(`Máximo de tentativas de reconexão atingido para agente ${id}`);
          }
        }
      }
    });

    sock.ev.on('messages.upsert', async (msg) => {
       const message = msg.messages[0];
       if (!message.message || message.key.fromMe) return;

       const from = message.key.remoteJid;
       const text = message.message.conversation || message.message.extendedTextMessage?.text;
       if (!text) return;

       console.log(`${from}: ${text}`);

       try {
         const response = await axios.post(
           'https://ia-rag-api.vercel.app/perguntar',
           { pergunta: text, id: id },
           { headers: { 'Content-Type': 'application/json' } }
         );

         const reply = response.data.resposta || 'Não consegui gerar uma resposta no momento.';
         await sock.sendMessage(from, { text: reply });
         console.log(`IA respondeu: ${reply}`);
       } catch (err) {
         console.error('Erro ao consultar IA:', err.message);
         await sock.sendMessage(from, { text: 'Não consegui falar com o servidor da IA agora.' });
       }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;

  } catch (err) {
    console.error(`Erro ao iniciar WhatsApp para agente ${id}:`, err?.message || err);
    whatsappStatusMap[id] = { status: 'erro', qr: null, error: err?.message };

    const nextAttempt = attempt + 1;
    if (nextAttempt <= 5) {
      const delay = Math.min(30000, 2000 * Math.pow(2, attempt));
      console.log(`Retry startWhatsApp para agente ${id} em ${delay}ms (tentativa ${nextAttempt})`);
      setTimeout(() => startWhatsApp(id, nextAttempt), delay);
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
    whatsappStatusMap[id] = { status: 'iniciando', qr: null };
    startWhatsApp(id);
    res.json({
      success: true,
      message:
        'Conexão com o WhatsApp iniciada! Aguarde o status mudar para "qr" ou "conectado".',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function restaurarSessoesWhatsApp() {
  const agentes = await buscarAgentesParaRestaurar();
  for (const agente of agentes) {
    if (agente.id) {
      startWhatsApp(agente.id);
      console.log(`Restaurando sessão WhatsApp para agente ${agente.id}`);
    }
  }
}
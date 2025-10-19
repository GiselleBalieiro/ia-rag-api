import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import Pino from 'pino';
import qrcode from 'qrcode';
import axios from 'axios';

let whatsappStatusMap = {};

export function getWhatsappStatus(id) {
  if (id) {
    return whatsappStatusMap[id] || { status: 'desconectado', qr: null };
  }
  return whatsappStatusMap;
}

export async function startWhatsApp(id, attempt = 0) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    const { version } = await fetchLatestBaileysVersion();
    const logger = Pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.windows('Chrome'),
    });

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
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.warn(`Conexão fechada para agente ${id}, reason:`, reason);
        whatsappStatusMap[id] = { status: 'desconectado', qr: null };

        if (reason !== DisconnectReason.loggedOut) {
          const nextAttempt = attempt + 1;
          const maxAttempts = 5;
          const delay = Math.min(30000, 2000 * Math.pow(2, attempt)); 
          if (nextAttempt <= maxAttempts) {
            console.log(
              `Tentando reconectar agente ${id} em ${delay}ms (tentativa ${nextAttempt})`,
            );
            setTimeout(() => startWhatsApp(id, nextAttempt), delay);
          } else {
            console.error(`Máximo de tentativas atingido para agente ${id}`);
          }
        } else {
          console.log(`Sessão encerrada para agente ${id}, requer novo QR.`);
        }
      }
    });

    sock.ev.on('messages.upsert', async (msg) => {
      const message = msg.messages[0];
      if (!message.message || message.key.fromMe) return;

      const from = message.key.remoteJid;
      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text;
      if (!text) return;

      console.log(`${from}: ${text}`);

      try {
        const response = await axios.post(
          'https://ia-rag-api.vercel.app/perguntar',
          {
            pergunta: text,
            id: id,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        const reply =
          response.data.resposta ||
          'Não consegui gerar uma resposta no momento.';

        await sock.sendMessage(from, { text: reply });
        console.log(`IA respondeu: ${reply}`);
      } catch (err) {
        console.error('Erro ao consultar IA:', err.message);
        await sock.sendMessage(from, {
          text: 'Não consegui falar com o servidor da IA agora.',
        });
      }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
  } catch (err) {
    console.error(
      `Erro ao iniciar WhatsApp para agente ${id}:`,
      err?.message || err,
    );
    whatsappStatusMap[id] = { status: 'erro', qr: null, error: err?.message };

    // retry simples
    const nextAttempt = attempt + 1;
    if (nextAttempt <= 5) {
      const delay = Math.min(30000, 2000 * Math.pow(2, attempt));
      console.log(
        `Retry startWhatsApp para agente ${id} em ${delay}ms (tentativa ${nextAttempt})`,
      );
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
        'Conexão com o WhatsApp iniciada! Veja o QR Code no console do servidor.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
import { buscarAgentesParaRestaurar } from './function.js';
export async function restaurarSessoesWhatsApp() {
  const agentes = await buscarAgentesParaRestaurar();
  for (const agente of agentes) {
    if (agente.id) {
      startWhatsApp(agente.id);
      console.log(`Restaurando sessão WhatsApp para agente ${agente.id}`);
    }
  }
}

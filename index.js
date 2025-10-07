import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import { pool } from "./db.js";
import { authenticateJWT } from "./auth.js";
import qrcode from "qrcode";


import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import Pino from "pino";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      "https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app",
      "https://agent-gules-alpha.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

async function buscarNoBanco() {
  try {
    const [rows] = await pool.query("SELECT NOW() AS agora");
    return rows[0];
  } catch (err) {
    console.error("Erro ao conectar no banco:", err);
    throw err;
  }
}


const fetchContextoViaPHP = async (id, userId, token) => {
  try {
    const response = await axios.get(
      `https://api-php-ff2c9710eabd.herokuapp.com/agent.php?id=${id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (
      !response.data ||
      !response.data.data ||
      !Array.isArray(response.data.data) ||
      !response.data.data[0].training
    ) {
      throw new Error("Treinamento não encontrado para o agente.");
    }

    return response.data.data[0].training;
  } catch (err) {
    throw new Error("Erro ao buscar contexto via PHP: " + err.message);
  }
};


app.post("/perguntar", authenticateJWT, async (req, res) => {
  const { pergunta, id } = req.body;

  if (!pergunta || !id) {
    return res
      .status(400)
      .json({ success: false, message: "Pergunta e ID são obrigatórios." });
  }

  try {
    const bancoData = await buscarNoBanco();
    console.log("Data atual do banco:", bancoData);

    const contexto = await fetchContextoViaPHP(
      id,
      req.user.user_id,
      req.headers.authorization?.split(" ")[1]
    );
    console.log(`Treinamento retornado para id=${id}:`, contexto);

    const messages = [
      {
        role: "system",
        content:
          "Você é um assistente útil que responde apenas com base nas informações fornecidas. Responda sempre em português.",
      },
      {
        role: "user",
        content: `Baseie sua resposta SOMENTE no conteúdo abaixo
        
CONTEÚDO:
${contexto}

PERGUNTA:
${pergunta}`,
      },
    ];

    const resposta = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        temperature: 0,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            "https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app/agents",
          "X-Title": "IA com RAG",
        },
      }
    );

    res.json({
      success: true,
      resposta: resposta.data.choices[0].message.content,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions");
  const { version } = await fetchLatestBaileysVersion();
  const logger = Pino({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.windows("Chrome"),
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Escaneie o QR abaixo para conectar:");
      const qrTerminal = await qrcode.toString(qr, { type: "terminal", small: true });
      console.log(qrTerminal);
    }

    if (connection === "open") {
      console.log("Conectado ao WhatsApp!");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("Conexão fechada:", reason);
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Tentando reconectar...");
        startWhatsApp();
      } else {
        console.log("Sessão encerrada, escaneie o QR novamente.");
      }
    }
  });

  sock.ev.on("messages.upsert", async (msg) => {
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
        "https://ia-rag-api.vercel.app/perguntar",
        {
          pergunta: text,
          id: "4", // ID do agente
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.JWT_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const reply =
        response.data.resposta ||
        "Não consegui gerar uma resposta no momento.";

      await sock.sendMessage(from, { text: reply });
      console.log(`IA respondeu: ${reply}`);
    } catch (err) {
      console.error("Erro ao consultar IA:", err.message);
      await sock.sendMessage(from, {
        text: "Não consegui falar com o servidor da IA agora.",
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

app.get("/conectar", async (req, res) => {
  try {
    startWhatsApp();
    res.json({
      success: true,
      message:
        "Conexão com o WhatsApp iniciada! Veja o QR Code no console do servidor.",
    });
  } catch (err) {
    console.error("Erro ao iniciar WhatsApp:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  await startWhatsApp();
});

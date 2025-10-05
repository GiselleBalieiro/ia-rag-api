import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import { pool } from "./db.js";
import logger from "./logger.js";
import sessionLogger from "./sessionLogger.js";
import { authenticateJWT } from "./auth.js";

import qrcode from "qrcode";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

dotenv.config();

const sessions = {};
const app = express();

app.use(cors({
  origin: [
    'https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app',
    'https://agent-gules-alpha.vercel.app',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
}));

app.use(express.json());
async function buscarNoBanco() {
  try {
    const [rows] = await pool.query('SELECT NOW() AS agora');
    return rows[0];
  } catch (err) {
    console.error("Erro ao conectar no banco:", err);
    throw err;
  }
}

const fetchContextoViaPHP = async (id, userId, token) => {
  try {
    const response = await axios.get(`https://api-php-ff2c9710eabd.herokuapp.com/agent.php?id=${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.data || !response.data.data || !Array.isArray(response.data.data) || !response.data.data[0].training) {
      throw new Error("Treinamento não encontrado para o agente.");
    }
    return response.data.data[0].training;
  } catch (err) {
    throw new Error("Erro ao buscar contexto via PHP: " + err.message);
  }
};

function validarPayloadPerguntar(payload) {
  if (!payload) return false;
  if (!payload.pergunta || !payload.id) return false;
  return true;
}

async function atualizarStatusSessao(agentId, status) {
  try {
    await pool.query("UPDATE agent SET status = ? WHERE id = ?", [status, agentId]);
    logger.info(`Status do agente ${agentId} atualizado para ${status}`);
  } catch (err) {
    logger.error(`Erro ao atualizar status do agente ${agentId}: ${err.message}`);
  }
}


app.post("/perguntar", authenticateJWT, async (req, res)  => {
  const { pergunta, id } = req.body;

  if (!pergunta || !id) {
    return res.status(400).json({ success: false, message: "Pergunta e ID são obrigatórios." });
  }

  try {
    const bancoData = await buscarNoBanco();
    console.log("Data atual do banco:", bancoData);

    const contexto = await fetchContextoViaPHP(id, req.user.user_id, req.headers.authorization?.split(' ')[1]);
    console.log(`Treinamento retornado para id=${id}:`, contexto);


    const messages = [
      {
        role: "system",
        content: "Você é um assistente útil que responde apenas com base nas informações fornecidas. Responda sempre em português."
      },
      {
        role: "user",
        content: `Baseie sua resposta SOMENTE no conteúdo abaixo

    CONTEÚDO:
    ${contexto}

    PERGUNTA:
    ${pergunta}`
      }
    ];

    const resposta = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "mistralai/mistral-7b-instruct",
      temperature: 0,
      messages
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app/agents",
        "X-Title": "IA com RAG"
      }
    });

    res.json({ success: true, resposta: resposta.data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


app.post("/conectar", async (req, res) => {
  const { number, agentId } = req.body;
  if (!number || !agentId) return res.status(400).json({ message: "Número e agentId obrigatórios" });

  // Se sessão já existe
  if (sessions[number]) {
    const status = sessions[number].status;
    if (status === "inicializando") return res.json({ message: "Sessão em inicialização, aguarde QR...", qr: sessions[number].qr });
    if (status === "conectado" || status === "autenticado") return res.json({ message: "Sessão já conectada", qr: sessions[number].qr });
    if (status === "desconectado") {
      // Reconectar manualmente
      sessions[number].status = "inicializando";
      try {
        await sessions[number].client.initialize();
      } catch (err) {
        console.error(`Erro ao reinicializar client: ${err.message}`);
      }
      return res.json({ message: "Reconectando sessão..." });
    }
  }

  // Criar novo client
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: `./sessions/${number}` }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--single-process",
        "--disable-extensions",
        "--disable-default-apps"
      ]
    }
  });

  sessions[number] = { client, agentId, status: "inicializando", qr: null, listenersAdded: false };

  // Adicionar listeners apenas uma vez
  if (!sessions[number].listenersAdded) {

    let qrSent = false;
    client.on("qr", async (qr) => {
      if (!qrSent) {
        const base64Qrimg = await qrcode.toDataURL(qr);
        sessions[number].qr = base64Qrimg;
        qrSent = true;
        if (!res.headersSent) res.json({ qr: base64Qrimg });
      }
    });

    client.on("authenticated", () => {
      sessions[number].status = "autenticado";
      console.info(`Sessão ${number}: autenticado`);
    });

    client.on("ready", async () => {
      sessions[number].status = "conectado";
      console.info(`Sessão ${number}: conectado`);
      await atualizarStatusSessao(agentId, 1);
    });

    client.on("disconnected", async (reason) => {
      console.warn(`Sessão ${number} desconectada: ${reason}`);
      sessions[number].status = "desconectado";
      await atualizarStatusSessao(agentId, 0);

      if (reason === "LOGOUT") {
        console.info(`Sessão ${number} precisa de novo login (QR).`);

        // Evitar destruir client imediatamente
        setTimeout(async () => {
          try {
            if (sessions[number]?.client) {
              await sessions[number].client.destroy();
              console.info(`Client ${number} destruído com segurança`);
            }
          } catch (err) {
            console.error(`Erro ao destruir client: ${err.message}`);
          }
        }, 1000); // Pequeno delay garante que tarefas pendentes terminem
      }
    });

    client.on("auth_failure", (msg) => {
      console.error(`Falha de autenticação (${number}): ${msg}`);
      sessions[number].status = "desconectado";
      if (!res.headersSent) res.status(401).json({ message: "Falha de autenticação no WhatsApp" });
    });

    client.on("message", async (message) => {
      try {
        if (message.fromMe || message.isStatus || message.isGroupMsg) return;
        const texto = message.body?.trim();
        if (!texto) return;

        const payload = { pergunta: texto, id: agentId };
        const respostaIA = await axios.post("http://ia-rag-api.vercel.app/perguntar", payload);
        const resposta = respostaIA.data.resposta;

        await client.sendMessage(message.from, resposta);
        console.info(`Mensagem de ${message.from}: ${texto}`);
        console.info(`Resposta enviada: ${resposta}`);
      } catch (err) {
        console.error(`Erro processando mensagem: ${err.message}`);
        await client.sendMessage(message.from, "Erro ao processar mensagem.");
      }
    });

    sessions[number].listenersAdded = true;
  }

  // Inicializa client
  try {
    await client.initialize();
  } catch (err) {
    console.error(`Erro ao inicializar sessão ${number}: ${err.message}`);
    sessions[number].status = "desconectado";
    if (!res.headersSent) res.status(500).json({ message: "Erro ao criar sessão" });
  }
});

app.post("/desconectar", authenticateJWT, async (req, res) => {
  const { number } = req.body;
  if (!number || !sessions[number] || !sessions[number].client) {
    return res.status(400).json({ success: false, message: "Sessão não encontrada." });
  }
  try {
    await sessions[number].client.logout();
    delete sessions[number];
    res.json({ success: true, message: "Sessão desconectada com sucesso." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/status", authenticateJWT, (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ message: "Número obrigatório" });

  const session = sessions[number];
  if (!session) {
    return res.json({ status: "desconectado", qr: null });
  }

  return res.json({ status: session.status, qr: session.qr || null });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// export default app; 

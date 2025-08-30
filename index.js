import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import { pool } from "./db.js"; 
import { create } from 'venom-bot';
import logger from "./logger.js";
import sessionLogger from "./sessionLogger.js";

dotenv.config();

const sessions = {};
const app = express();

app.use(cors({
  origin: [
    'https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app',
    'https://agent-gules-alpha.vercel.app',
    'http://localhost:5173'
  ]
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

const fetchContextoViaPHP = async (id) => {
  try {
    const response = await axios.get(`https://api-php-ff2c9710eabd.herokuapp.com/agent.php?id=${id}`);
    if (
      !response.data ||
      !response.data.data ||
      !Array.isArray(response.data.data) ||
      !response.data.data[0] ||
      !response.data.data[0].training
    ) {
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


app.post("/perguntar", async (req, res) => {
  const { pergunta, id } = req.body;

  if (!pergunta || !id) {
    return res.status(400).json({ success: false, message: "Pergunta e ID são obrigatórios." });
  }

  try {
    const bancoData = await buscarNoBanco();
    console.log("Data atual do banco:", bancoData);

    const contexto = await fetchContextoViaPHP(id);
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

  if (sessions[number]) return res.json({ message: "Sessão já existe", qr: sessions[number].qr });


  create(
    `${number}`,
    (base64Qrimg) => {
      sessions[number] = { qr: base64Qrimg, agentId, status: "qr" };
      res.json({ qr: base64Qrimg });

      sessionLogger.info(`Sessão ${number}: QR gerado`);
    },
    (statusSession, session) => {
      sessionLogger.info(`Sessão ${session}: ${statusSession}`);
      if (sessions[number]) {
        sessions[number].status = statusSession;
      }
    },
    { logQR: false }
  ).then((client) => {
    sessions[number].client = client;

    client.onMessage(async (message) => {
      try {
        if (message.isGroupMsg) return;
        if (message.fromMe) return;

        if (!message.body || typeof message.body !== "string" || !message.body.trim()) {
          sessionLogger.info(
            `Mensagem bloqueada de ${message.from}: mensagem sem texto ou inválida.`
          );
          return;
        }

        const payload = {
          pergunta: message.body,
          id: agentId,
        };

        if (!validarPayloadPerguntar(payload)) {
          sessionLogger.error(
            `Payload inválido para /perguntar: pergunta='${payload.pergunta}', id='${payload.id}'`
          );
          await client.sendText(message.from, "Erro: pergunta e ID são obrigatórios.");
          return;
        }

        const respostaIA = await axios.post("http://localhost:3000/perguntar", payload);

        const resposta = respostaIA.data.resposta;
        await client.sendText(message.from, resposta);

        logger.info(`Mensagem de ${message.from}: ${message.body}`);
        logger.info(`Resposta enviada: ${resposta}`);

      } catch (err) {
        if (err.response) {
          logger.error(`Erro API [${err.response.status}]: ${JSON.stringify(err.response.data)}`);
        } else if (err.request) {
          logger.error(`Sem resposta da API: ${err.request._header}`);
        } else {
          logger.error(`Erro inesperado: ${err.message}`);
        }

        await client.sendText(message.from, "Erro ao processar mensagem");
      }
    });
  }).catch(err => {
    sessionLogger.error(`Erro na sessão ${number}: ${err.message}`);
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

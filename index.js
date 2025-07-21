import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

const app = express();

app.use(cors({ origin: 'https://agent-gules-alpha.vercel.app/agents' }));
app.use(express.json());


const fetchContextoViaPHP = async (id) => {
  try {
    const response = await axios.get(`https://api-php-ff2c9710eabd.herokuapp.com/agent.php?id=${id}`);
    if (!response.data.success) throw new Error(response.data.message);
    return response.data.training;
  } catch (err) {
    throw new Error("Erro ao buscar contexto via PHP: " + err.message);
  }
};

app.post("/perguntar", async (req, res) => {
  const { pergunta, id } = req.body;

  if (!pergunta || !id) {
    return res.status(400).json({ success: false, message: "Pergunta e ID são obrigatórios." });
  }

  try {
    const contexto = await fetchContextoViaPHP(id);

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
        "HTTP-Referer": "https://agent-gules-alpha.vercel.app/agents",
        "X-Title": "IA com RAG"
      }
    });

    res.json({ success: true, resposta: resposta.data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(3001, () => console.log("IA RAG ouvindo na porta 3001"));

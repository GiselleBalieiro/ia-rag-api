import axios from "axios";

export async function perguntarIA(pergunta, contexto, historico = []) {
  const messages = [
    {
      role: "system",
      content:
        "Você é um assistente útil que responde apenas com base nas informações fornecidas. Responda sempre em português. Baseie suas respostas SOMENTE no contexto fornecido. Se a resposta não estiver no contexto, diga que não sabe a informação.",
    },
  ];

  messages.push(...historico);

  messages.push({
    role: "user",
    content: `CONTEXTO PARA SUA RESPOSTA:
---
${contexto}
---

PERGUNTA DO USUÁRIO:
${pergunta}`,
  });

  const resposta = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "mistralai/mistral-7b-instruct",
      temperature: 0.2,
      max_tokens: 100,
      messages,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // "HTTP-Referer":
        //   "https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app/agents",
        // "X-Title": "IA com RAG",
      },
    }
  );
  return resposta.data.choices[0].message.content;
}
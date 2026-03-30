import express from 'express';
import { fetchContextoRAG } from '../controllers/function.js';
import { perguntarIA } from '../controllers/ia.js';
import { getHistory, saveHistory, cleanupExpiredHistories } from '../controllers/conversationHistory.js';

const router = express.Router();

// Limpa históricos expirados a cada 1 hora
setInterval(cleanupExpiredHistories, 60 * 60 * 1000);

router.post('/perguntar', async (req, res) => {
  const { pergunta, id, userId } = req.body;
  if (!pergunta || !id) {
    return res
      .status(400)
      .json({ success: false, message: 'Pergunta e ID são obrigatórios.' });
  }

  if (typeof pergunta !== 'string' || pergunta.length > 2000) {
    return res
      .status(400)
      .json({ success: false, message: 'Pergunta deve ter no máximo 2000 caracteres.' });
  }

  try {
    const conversationKey = userId ? `${id}_${userId}` : id;

    const historico = await getHistory(conversationKey);

    const contexto = await fetchContextoRAG(id, pergunta);

    const resposta = await perguntarIA(pergunta, contexto, historico);

    historico.push({ role: 'user', content: pergunta });
    historico.push({ role: 'assistant', content: resposta });

    await saveHistory(conversationKey, historico);

    res.json({ success: true, resposta });

  } catch (err) {
    console.error(`[Servidor] Erro na rota /perguntar para o ID ${id}:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
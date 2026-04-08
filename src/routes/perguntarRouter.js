import express from 'express';
import rateLimit from 'express-rate-limit';
import { fetchContextoRAG } from '../controllers/function.js';
import { perguntarIA } from '../controllers/ia.js';
import { getHistory, saveHistory, cleanupExpiredHistories } from '../controllers/conversationHistory.js';

const router = express.Router();

// Limpa históricos expirados a cada 1 hora
setInterval(cleanupExpiredHistories, 60 * 60 * 1000);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/perguntar', aiLimiter, async (req, res) => {
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

    let historico = [];
    try {
      historico = await getHistory(conversationKey);
    } catch (err) {
      console.warn(`[History] Falha ao buscar histórico, continuando sem: ${err.message}`);
    }

    const contexto = await fetchContextoRAG(id, pergunta);

    const resposta = await perguntarIA(pergunta, contexto, historico);

    historico.push({ role: 'user', content: pergunta });
    historico.push({ role: 'assistant', content: resposta });

    saveHistory(conversationKey, historico).catch(err =>
      console.warn(`[History] Falha ao salvar histórico: ${err.message}`)
    );

    res.json({ success: true, resposta });

  } catch (err) {
    console.error(`[Servidor] Erro na rota /perguntar para o ID ${id}:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
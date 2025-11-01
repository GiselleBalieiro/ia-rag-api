import express from 'express';
import { fetchContextoViaPHP } from '../controllers/function.js';
import { perguntarIA } from '../controllers/ia.js';

const router = express.Router();

const conversasAtivas = {};
const conversasTimestamps = {}; // Armazena timestamp da última atividade

// Função para limpar conversas inativas há mais de 24 horas
function limparConversasAntigas() {
  const agora = Date.now();
  const limite24h = 24 * 60 * 60 * 1000; // 24 horas em ms

  let removidas = 0;
  for (const key in conversasTimestamps) {
    const tempoInativo = agora - conversasTimestamps[key];
    if (tempoInativo > limite24h) {
      delete conversasAtivas[key];
      delete conversasTimestamps[key];
      removidas++;
    }
  }

  if (removidas > 0) {
    console.log(`[Servidor] Limpeza automática: ${removidas} conversa(s) antiga(s) removida(s)`);
  }
}

// Executa limpeza a cada 1 hora
setInterval(limparConversasAntigas, 60 * 60 * 1000);

router.post('/perguntar', async (req, res) => {
  const { pergunta, id, userId } = req.body;
  if (!pergunta || !id) {
    return res
      .status(400)
      .json({ success: false, message: 'Pergunta e ID são obrigatórios.' });
  }

  try {
    // Usa chave composta: agente_cliente para manter históricos separados
    const conversationKey = userId ? `${id}_${userId}` : id;

    if (!conversasAtivas[conversationKey]) {
      conversasAtivas[conversationKey] = [];
      console.log(`[Servidor] Nova conversa iniciada para: ${conversationKey}`);
    }

    // Atualiza timestamp da última atividade
    conversasTimestamps[conversationKey] = Date.now();

    const historico = conversasAtivas[conversationKey];

    const contexto = await fetchContextoViaPHP(id);

    const resposta = await perguntarIA(pergunta, contexto, historico);

    historico.push({ role: 'user', content: pergunta });
    historico.push({ role: 'assistant', content: resposta });

    res.json({ success: true, resposta });
    
  } catch (err) {
    console.error(`[Servidor] Erro na rota /perguntar para o ID ${id}:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
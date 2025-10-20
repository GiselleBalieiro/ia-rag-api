import express from 'express';
import { fetchContextoViaPHP } from '../controllers/function.js';
import { perguntarIA } from '../controllers/ia.js';

const router = express.Router();

const conversasAtivas = {};

router.post('/perguntar', async (req, res) => {
  const { pergunta, id } = req.body;
  if (!pergunta || !id) {
    return res
      .status(400)
      .json({ success: false, message: 'Pergunta e ID são obrigatórios.' });
  }

  try {
    if (!conversasAtivas[id]) {
      conversasAtivas[id] = []; 
      console.log(`[Servidor] Nova conversa iniciada para o ID: ${id}`);
    }

    const historico = conversasAtivas[id];

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
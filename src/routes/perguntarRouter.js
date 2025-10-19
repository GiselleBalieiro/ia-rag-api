import express from 'express';
import { fetchContextoViaPHP } from '../controllers/function.js';
import { perguntarIA } from '../controllers/ia.js';

const router = express.Router();

router.post('/perguntar', async (req, res) => {
  const { pergunta, id } = req.body;
  if (!pergunta || !id) {
    return res
      .status(400)
      .json({ success: false, message: 'Pergunta e ID são obrigatórios.' });
  }
  try {
    const contexto = await fetchContextoViaPHP(id);
    const resposta = await perguntarIA(pergunta, contexto);
    res.json({ success: true, resposta });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
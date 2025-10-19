import express from 'express';
import { getWhatsappStatus, conectarWhatsApp } from '../controllers/whatsapp.js';

const router = express.Router();

router.get('/status', (req, res) => {
  const id = req.query.id;
  try {
    const status = getWhatsappStatus(id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/conectar', conectarWhatsApp);

export default router;
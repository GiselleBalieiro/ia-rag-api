import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { restaurarSessoesWhatsApp } from './src/controllers/whatsapp.js';
import perguntasRouter from './src/routes/perguntarRouter.js';
import whatsappRouter from './src/routes/whatsappRouter.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      'https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app',
      'https://agent-gules-alpha.vercel.app',
      'http://localhost:5173',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.use(express.json());

app.use('/', perguntasRouter);
app.use('/', whatsappRouter);


(async () => {
  try {
    await restaurarSessoesWhatsApp();
    console.log('Tentativa de restaurar sessões executada.');
  } catch (err) {
    console.error('Erro ao restaurar sessões (capturado):', err);
  }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

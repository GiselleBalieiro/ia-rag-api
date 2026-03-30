import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRouter from "./src/routes/authRouter.js";
import perguntasRouter from './src/routes/perguntarRouter.js';
import whatsappRouter from './src/routes/whatsappRouter.js';
import agentRouter from './src/routes/agentRouter.js';
import healthRouter from './src/routes/healthRouter.js';
import webhookRouter from './src/routes/webhookRouter.js';
import metaRouter from './src/routes/metaRouter.js';
import { restaurarConexoes } from './src/controllers/restoreSessions.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      'https://agent-5mygpia1j-gisellebalieiros-projects.vercel.app',
      'https://agent-gules-alpha.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://giselle-balieiro.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/perguntar', aiLimiter);

app.use('/', perguntasRouter);
app.use('/', whatsappRouter);
app.use('/agent', agentRouter);
app.use("/user", authRouter);
app.use('/', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/api/meta', metaRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}${process.env.CLIENT_ID ? ` | Client: ${process.env.CLIENT_ID}` : ''}${process.env.AGENT_IDS ? ` | Agents: ${process.env.AGENT_IDS}` : ''}`);

  // Restaura sessões automaticamente ao iniciar
  try {
    await restaurarConexoes();
  } catch (err) {
    console.error('[Servidor] Erro ao restaurar conexões:', err.message);
  }
});

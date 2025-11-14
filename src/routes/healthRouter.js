import express from 'express';
import { healthCheck, getMetrics } from '../controllers/metricsController.js';

const router = express.Router();

router.get('/health', healthCheck);

router.get('/metrics', getMetrics);

export default router;

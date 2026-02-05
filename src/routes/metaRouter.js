import express from 'express';
import { createMetaConfig, updateMetaConfig, getMetaConfig } from '../controllers/metaController.js';
import { authenticateJWT } from '../config/auth.js';

const router = express.Router();

router.use(authenticateJWT);

router.post('/', createMetaConfig);
router.put('/:id', updateMetaConfig);
router.get('/:agent_id', getMetaConfig);

export default router;

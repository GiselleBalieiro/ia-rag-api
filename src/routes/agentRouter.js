import express from "express";
import {
  getAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
} from "../controllers/agentController.js";
import { authenticateJWT } from "../config/auth.js";

const router = express.Router();

router.use(authenticateJWT);

router.get("/", getAgents);
router.get("/:id", getAgentById);
router.post("/", createAgent);
router.post("/update/:id", updateAgent);
router.delete("/:id", deleteAgent);

export default router;

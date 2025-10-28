import express from "express";
import { login, register } from "../controllers/authController.js";
import { authenticateJWT } from "../config/auth.js";

const router = express.Router();

router.post("/", (req, res) => {
  if (req.query.register) {
    return register(req, res);
  }
  return login(req, res);
});

router.get("/", authenticateJWT, (req, res) => {
  return res.json({ success: true, user: req.user });
});


export default router;

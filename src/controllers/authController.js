import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { generateToken } from "../config/generateToken.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email e senha são obrigatórios",
      });
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, password FROM user WHERE email = ? LIMIT 1",
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }

    const storedPassword = user.password || "";
    let senhaValida = false;

    if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
      senhaValida = await bcrypt.compare(password, storedPassword);
    } else {
      senhaValida = password === storedPassword;
    }

    if (!senhaValida) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }

    const userData = { id: user.id, name: user.name, email: user.email };
    const token = generateToken(userData);

    res.json({
      success: true,
      message: "Login efetuado com sucesso!",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno ao efetuar login",
    });
  }
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Campos obrigatórios faltando",
      });
    }

    const [existing] = await pool.query(
      "SELECT id FROM user WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email já cadastrado",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO user (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );

    const newUser = {
      id: result.insertId,
      name,
      email,
    };

    res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso!",
      user: newUser,
    });
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno ao criar usuário",
    });
  }
};

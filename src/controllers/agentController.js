import { pool } from "../config/db.js";

export async function getAgents(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM agent WHERE user_id = ?",
      [req.user_id]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Erro ao buscar agentes:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar agentes",
    });
  }
}

export async function getAgentById(req, res) {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM agent WHERE id = ? AND user_id = ?",
      [id, req.user_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Agente não encontrado ou não pertence ao usuário",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Erro ao buscar agente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao buscar agente",
    });
  }
}

export async function createAgent(req, res) {
  const data = { ...req.body, user_id: req.user_id };

  if (!Object.keys(req.body).length) {
    return res.status(400).json({
      success: false,
      message: "Nenhum dado enviado",
    });
  }

  try {
    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data).map(() => "?").join(", ");
    const values = Object.values(data);

    const sql = `INSERT INTO agent (${columns}) VALUES (${placeholders})`;
    const [result] = await pool.query(sql, values);

    if (!result.affectedRows) {
      return res.status(500).json({
        success: false,
        message: "Falha ao inserir agente",
      });
    }

    const insertedId = result.insertId;
    const [rows] = await pool.query(
      "SELECT * FROM agent WHERE id = ? AND user_id = ?",
      [insertedId, req.user_id]
    );

    res.json({
      success: true,
      message: "Agente inserido com sucesso",
      id: insertedId,
      data: rows[0],
    });
  } catch (error) {
    console.error("Erro ao inserir agente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao inserir agente",
    });
  }
}

export async function updateAgent(req, res) {
  const { id } = req.params;
  const data = req.body;

  if (!id || !Object.keys(data).length) {
    return res.status(400).json({
      success: false,
      message: "Dados insuficientes para atualização",
    });
  }

  try {
    const fields = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(data), id, req.user_id];

    const [result] = await pool.query(
      `UPDATE agent SET ${fields} WHERE id = ? AND user_id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Agente não encontrado ou não pertence ao usuário",
      });
    }

    res.json({
      success: true,
      message: "Agente atualizado com sucesso",
    });
  } catch (error) {
    console.error("Erro ao atualizar agente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao atualizar agente",
    });
  }
}

export async function deleteAgent(req, res) {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      "DELETE FROM agent WHERE id = ? AND user_id = ?",
      [id, req.user_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Agente não encontrado ou não pertence ao usuário",
      });
    }

    res.json({
      success: true,
      message: "Agente deletado com sucesso",
    });
  } catch (error) {
    console.error("Erro ao deletar agente:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao deletar agente",
    });
  }
}

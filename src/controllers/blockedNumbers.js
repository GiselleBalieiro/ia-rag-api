import { pool } from "../config/db.js";


function parseDuration(duration) {
  const match = duration.match(/^(\d+)(hr|h|d|a|ano|anos)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'hr':
    case 'h':
      return value * 60 * 60 * 1000; // horas
    case 'd':
      return value * 24 * 60 * 60 * 1000; // dias
    case 'a':
    case 'ano':
    case 'anos':
      return value * 365 * 24 * 60 * 60 * 1000; // anos
    default:
      return null;
  }
}

export async function blockNumber(agentId, phoneNumber, blockedBy, duration = '24hr') {
  try {

    await pool.query(
      "DELETE FROM blocked_numbers WHERE agent_id = ? AND phone_number = ?",
      [agentId, phoneNumber]
    );

    const durationMs = parseDuration(duration);
    if (!durationMs) {
      console.error(`Duração inválida: ${duration}`);
      return null;
    }


    const blockedUntil = new Date(Date.now() + durationMs);

    const [result] = await pool.query(
      `INSERT INTO blocked_numbers (agent_id, phone_number, blocked_until, blocked_by)
       VALUES (?, ?, ?, ?)`,
      [agentId, phoneNumber, blockedUntil, blockedBy]
    );

    console.log(`Número ${phoneNumber} bloqueado até ${blockedUntil.toLocaleString('pt-BR')} (${duration}) para agente ${agentId}`);

    return {
      success: result.affectedRows > 0,
      blockedUntil,
      duration
    };
  } catch (error) {
    console.error("Erro ao bloquear número:", error);
    return null;
  }
}

export async function unblockNumber(agentId, phoneNumber) {
  try {
    const [result] = await pool.query(
      "DELETE FROM blocked_numbers WHERE agent_id = ? AND phone_number = ?",
      [agentId, phoneNumber]
    );

    console.log(`Número ${phoneNumber} desbloqueado para agente ${agentId}`);
    return result.affectedRows > 0;
  } catch (error) {
    console.error("Erro ao desbloquear número:", error);
    return false;
  }
}


export async function isNumberBlocked(agentId, phoneNumber) {
  try {
    const now = new Date();

    const [rows] = await pool.query(
      `SELECT * FROM blocked_numbers
       WHERE agent_id = ? AND phone_number = ? AND blocked_until > ?`,
      [agentId, phoneNumber, now]
    );

    await pool.query(
      "DELETE FROM blocked_numbers WHERE blocked_until <= ?",
      [now]
    );

    return rows.length > 0;
  } catch (error) {
    console.error("Erro ao verificar bloqueio:", error);
    return false;
  }
}


export async function getBlockInfo(agentId, phoneNumber) {
  try {
    const now = new Date();

    const [rows] = await pool.query(
      `SELECT * FROM blocked_numbers
       WHERE agent_id = ? AND phone_number = ? AND blocked_until > ?`,
      [agentId, phoneNumber, now]
    );

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Erro ao buscar info de bloqueio:", error);
    return null;
  }
}


export async function listBlockedNumbers(agentId) {
  try {
    const now = new Date();

    await pool.query(
      "DELETE FROM blocked_numbers WHERE blocked_until <= ?",
      [now]
    );

    const [rows] = await pool.query(
      `SELECT * FROM blocked_numbers
       WHERE agent_id = ? AND blocked_until > ?
       ORDER BY blocked_at DESC`,
      [agentId, now]
    );

    return rows;
  } catch (error) {
    console.error("Erro ao listar números bloqueados:", error);
    return [];
  }
}

export function detectHumanRequest(text) {
  const normalizedText = text.toLowerCase().trim();

  const patterns = [
    /quero\s+falar\s+com\s+(um\s+)?atendente/i,
    /preciso\s+falar\s+com\s+(um\s+)?atendente/i,
    /chamar\s+(um\s+)?atendente/i,
    /transferir\s+para\s+(um\s+)?atendente/i,
    /atendente\s+humano/i,
    /pessoa\s+de\s+verdade/i,
    /n[ãa]o\s+quero\s+(falar\s+com\s+)?rob[ôo]/i,
    /quero\s+(uma\s+)?pessoa/i,
    /falar\s+com\s+humano/i,
    /me\s+transfere/i,
    /transferir\s+atendimento/i
  ];

  return patterns.some(pattern => pattern.test(normalizedText));
}

import { pool } from '../config/db.js';
import axios from 'axios';

export const fetchContextoViaPHP = async (id) => {
  try {
    const [rows] = await pool.query(
      'SELECT training FROM agent WHERE id = ? LIMIT 1',
      [id],
    );
    if (!rows.length || !rows[0].training) {
      throw new Error('Treinamento não encontrado para o agente.');
    }
    return rows[0].training;
  } catch (err) {
    throw new Error('Erro ao buscar contexto no banco: ' + err.message);
  }
};

export const buscarAgentesParaRestaurar = async () => {
  try {
    const [rows] = await pool.query('SELECT id FROM agent WHERE status = 1');
    return rows.map((agente) => ({ id: agente.id }));
  } catch (err) {
    throw new Error('Erro ao buscar agentes no banco: ' + err.message);
  }
};

export const getOwnerPhone = async (id) => {
  try {
    const [rows] = await pool.query(
      'SELECT owner_phone FROM agent WHERE id = ? LIMIT 1',
      [id],
    );
    if (!rows.length || !rows[0].owner_phone) {
      return null;
    }
    return rows[0].owner_phone;
  } catch (err) {
    console.error('Erro ao buscar owner_phone:', err.message);
    return null;
  }
};

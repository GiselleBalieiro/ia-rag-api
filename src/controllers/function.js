import { pool } from '../config/db.js';
import axios from 'axios';
import { ensureIndexed } from '../rag/indexAgent.js';
import { generateEmbedding } from '../rag/embeddings.js';
import { searchSimilar } from '../rag/vectorStore.js';

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

/**
 * Busca contexto via RAG: indexa se necessário, busca chunks similares.
 * Fallback para texto completo se RAG falhar (ex: sem OPENAI_API_KEY).
 */
export const fetchContextoRAG = async (id, pergunta) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[RAG] OPENAI_API_KEY não configurada. Usando contexto completo.');
      return await fetchContextoViaPHP(id);
    }

    const isIndexed = await ensureIndexed(id);
    if (!isIndexed) {
      return await fetchContextoViaPHP(id);
    }

    const queryEmbedding = await generateEmbedding(pergunta);
    const results = await searchSimilar(id, queryEmbedding, 4);

    if (results.length === 0) {
      console.warn(`[RAG] Nenhum chunk encontrado para agente ${id}. Usando contexto completo.`);
      return await fetchContextoViaPHP(id);
    }

    const contexto = results.map(r => r.text).join('\n\n---\n\n');
    console.log(`[RAG] Agente ${id}: ${results.length} chunks selecionados (scores: ${results.map(r => r.score.toFixed(3)).join(', ')})`);
    return contexto;
  } catch (err) {
    console.error(`[RAG] Erro para agente ${id}:`, err.message, '— usando fallback.');
    return await fetchContextoViaPHP(id);
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
      'SELECT number FROM agent WHERE id = ? LIMIT 1',
      [id],
    );
    if (!rows.length || !rows[0].number) {
      return null;
    }
    return rows[0].number;
  } catch (err) {
    console.error('Erro ao buscar number:', err.message);
    return null;
  }
};

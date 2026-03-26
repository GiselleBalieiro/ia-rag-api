import crypto from 'crypto';
import { chunkText } from './chunker.js';
import { generateEmbeddings } from './embeddings.js';
import { storeChunks, getTrainingHash, saveTrainingHash } from './vectorStore.js';
import { fetchContextoViaPHP } from '../controllers/function.js';

/**
 * Indexa o training de um agente: chunk → embedding → MongoDB.
 */
export async function indexAgentTraining(agentId) {
  console.log(`[RAG] Indexando agente ${agentId}...`);

  const training = await fetchContextoViaPHP(agentId);

  if (!training || !training.trim()) {
    console.warn(`[RAG] Agente ${agentId} não tem training. Pulando indexação.`);
    return { indexed: false, reason: 'no_training' };
  }

  const chunks = chunkText(training);

  if (chunks.length === 0) {
    console.warn(`[RAG] Nenhum chunk gerado para agente ${agentId}.`);
    return { indexed: false, reason: 'no_chunks' };
  }

  console.log(`[RAG] ${chunks.length} chunks gerados. Gerando embeddings...`);

  const texts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddings(texts);

  await storeChunks(agentId, chunks, embeddings);

  const hash = crypto.createHash('md5').update(training).digest('hex');
  await saveTrainingHash(agentId, hash);

  console.log(`[RAG] Agente ${agentId} indexado com sucesso (${chunks.length} chunks).`);
  return { indexed: true, chunks: chunks.length };
}

/**
 * Verifica se o training mudou. Se mudou, re-indexa.
 * Retorna true se o agente está indexado e pronto.
 */
export async function ensureIndexed(agentId) {
  const training = await fetchContextoViaPHP(agentId);

  if (!training || !training.trim()) {
    return false;
  }

  const currentHash = crypto.createHash('md5').update(training).digest('hex');
  const savedHash = await getTrainingHash(agentId);

  if (currentHash === savedHash) {
    return true; // Já indexado e atualizado
  }

  // Training mudou ou nunca foi indexado
  await indexAgentTraining(agentId);
  return true;
}

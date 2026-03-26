import { MongoClient } from 'mongodb';

const DB_NAME = 'rag_db';
const COLLECTION_NAME = 'agent_chunks';

let mongoClient;

async function getClient() {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGO_URL, {
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    console.log('[RAG] Conectado ao MongoDB para vector store');
  }
  return mongoClient;
}

function getCollection() {
  return getClient().then(client => client.db(DB_NAME).collection(COLLECTION_NAME));
}

/**
 * Salva chunks com embeddings para um agente.
 * Remove chunks antigos antes de inserir novos.
 */
export async function storeChunks(agentId, chunks, embeddings) {
  const collection = await getCollection();

  // Remove chunks antigos desse agente
  await collection.deleteMany({ agentId });

  // Insere novos
  const docs = chunks.map((chunk, i) => ({
    agentId,
    chunkIndex: chunk.index,
    text: chunk.text,
    embedding: embeddings[i],
    createdAt: new Date(),
  }));

  if (docs.length > 0) {
    await collection.insertMany(docs);
  }

  console.log(`[RAG] ${docs.length} chunks salvos para agente ${agentId}`);
}

/**
 * Busca os chunks mais similares usando cosine similarity.
 * Compatível com MongoDB Atlas M0 (free tier) — calcula similaridade no app.
 */
export async function searchSimilar(agentId, queryEmbedding, topK = 3) {
  const collection = await getCollection();

  // Busca todos os chunks do agente
  const chunks = await collection.find(
    { agentId },
    { projection: { text: 1, embedding: 1, chunkIndex: 1 } }
  ).toArray();

  if (chunks.length === 0) return [];

  // Calcula cosine similarity no app (funciona no free tier)
  const scored = chunks.map(chunk => ({
    text: chunk.text,
    chunkIndex: chunk.chunkIndex,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Ordena por similaridade e retorna top-K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Retorna o hash salvo do training de um agente (para evitar re-indexação).
 */
export async function getTrainingHash(agentId) {
  const client = await getClient();
  const meta = client.db(DB_NAME).collection('agent_meta');
  const doc = await meta.findOne({ _id: agentId });
  return doc?.trainingHash || null;
}

/**
 * Salva o hash do training para controle de re-indexação.
 */
export async function saveTrainingHash(agentId, hash) {
  const client = await getClient();
  const meta = client.db(DB_NAME).collection('agent_meta');
  await meta.updateOne(
    { _id: agentId },
    { $set: { trainingHash: hash, updatedAt: new Date() } },
    { upsert: true }
  );
}

/**
 * Remove todos os dados RAG de um agente.
 */
export async function removeAgentData(agentId) {
  const collection = await getCollection();
  await collection.deleteMany({ agentId });

  const client = await getClient();
  const meta = client.db(DB_NAME).collection('agent_meta');
  await meta.deleteOne({ _id: agentId });
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

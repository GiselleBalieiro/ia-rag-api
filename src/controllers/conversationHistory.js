import { MongoClient } from 'mongodb';

const DB_NAME = 'rag_db';
const COLLECTION_NAME = 'conversation_history';
const MAX_HISTORY_PER_USER = 10;
const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

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
  }
  return mongoClient;
}

async function getCollection() {
  const client = await getClient();
  return client.db(DB_NAME).collection(COLLECTION_NAME);
}

/**
 * Busca histórico de conversa do MongoDB.
 */
export async function getHistory(conversationKey) {
  try {
    const collection = await getCollection();
    const doc = await collection.findOne({ _id: conversationKey });

    if (!doc) return [];

    // Limpa se expirou
    if (Date.now() - doc.updatedAt > HISTORY_MAX_AGE_MS) {
      await collection.deleteOne({ _id: conversationKey });
      return [];
    }

    return doc.messages || [];
  } catch (err) {
    console.error(`[History] Erro ao buscar histórico de ${conversationKey}:`, err.message);
    return [];
  }
}

/**
 * Salva mensagens no histórico, mantendo limite de MAX_HISTORY_PER_USER.
 */
export async function saveHistory(conversationKey, messages) {
  try {
    const trimmed = messages.slice(-MAX_HISTORY_PER_USER);
    const collection = await getCollection();

    await collection.updateOne(
      { _id: conversationKey },
      {
        $set: {
          messages: trimmed,
          updatedAt: Date.now(),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[History] Erro ao salvar histórico de ${conversationKey}:`, err.message);
  }
}

/**
 * Limpa históricos expirados (>24h). Chamar periodicamente.
 */
export async function cleanupExpiredHistories() {
  try {
    const collection = await getCollection();
    const cutoff = Date.now() - HISTORY_MAX_AGE_MS;

    const result = await collection.deleteMany({ updatedAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(`[History] ${result.deletedCount} histórico(s) expirado(s) removido(s).`);
    }
  } catch (err) {
    console.error('[History] Erro ao limpar históricos:', err.message);
  }
}

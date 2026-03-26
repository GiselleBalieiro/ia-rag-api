import axios from 'axios';

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';

/**
 * Gera embedding para um texto usando OpenAI.
 */
export async function generateEmbedding(text) {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

/**
 * Gera embeddings em batch (até 20 textos por chamada).
 */
export async function generateEmbeddings(texts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada. Necessária para gerar embeddings.');
  }

  const results = [];
  const batchSize = 20;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: MODEL,
        input: batch,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const embeddings = response.data.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);

    results.push(...embeddings);
  }

  return results;
}

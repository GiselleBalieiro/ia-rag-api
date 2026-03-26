/**
 * Divide texto em chunks de tamanho aproximado com overlap.
 * Não precisa de dependências externas.
 */

const APPROX_CHARS_PER_TOKEN = 4;

export function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text || !text.trim()) return [];

  const maxChars = chunkSize * APPROX_CHARS_PER_TOKEN;
  const overlapChars = overlap * APPROX_CHARS_PER_TOKEN;

  // Divide em parágrafos primeiro
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // Se o parágrafo sozinho já estoura o chunk, divide por sentenças
    if (paragraph.length > maxChars) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((currentChunk + ' ' + sentence).length > maxChars && currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          // Overlap: pega o final do chunk anterior
          const words = currentChunk.split(/\s+/);
          const overlapWords = Math.ceil(overlapChars / 5); // ~5 chars por palavra
          currentChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      }
      continue;
    }

    if ((currentChunk + '\n\n' + paragraph).length > maxChars && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      // Overlap
      const words = currentChunk.split(/\s+/);
      const overlapWords = Math.ceil(overlapChars / 5);
      currentChunk = words.slice(-overlapWords).join(' ') + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.map((text, index) => ({ text, index }));
}

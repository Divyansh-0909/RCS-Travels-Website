import OpenAI from "openai";

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
let openai: OpenAI | undefined;

export function validateEmbedding(embedding: unknown): asserts embedding is number[] {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`Embedding must contain ${EMBEDDING_DIMENSIONS} finite numbers`);
  }
}

async function embed(text: string) {
  if (!text.trim()) throw new Error('Cannot embed empty text');
  openai ??= new OpenAI({ timeout: 30_000, maxRetries: 2 });
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  validateEmbedding(embedding);
  return embedding;
}

export default embed;

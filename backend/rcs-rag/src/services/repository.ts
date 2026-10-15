import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Chunk } from './chunker.ts';
import { EMBEDDING_MODEL, validateEmbedding } from './embedder.ts';

export type StoredChunk = Chunk & { sourcePath: string; documentName: string; embedding: number[] };
export const contentHash = (content: string) => createHash('sha256').update(content).digest('hex');

export async function existingEmbeddings(db: PrismaClient, sourcePath: string) {
  return db.$queryRaw<Array<{ chunk_key: string; content_hash: string; embedding_model: string; embedding: string }>>`
    SELECT chunk_key, content_hash, embedding_model, embedding::text AS embedding
    FROM public.policy_chunks WHERE source_path = ${sourcePath}
  `;
}

export async function storeDocument(db: PrismaClient, sourcePath: string, chunks: StoredChunk[]) {
  if (!chunks.length || chunks.some(chunk => chunk.sourcePath !== sourcePath)) {
    throw new Error('A nonempty, single-document chunk set is required');
  }
  if (new Set(chunks.map(chunk => chunk.chunkKey)).size !== chunks.length) {
    throw new Error('Duplicate chunk keys in document');
  }
  for (const chunk of chunks) validateEmbedding(chunk.embedding);
  return db.$transaction(async tx => {
    // Serialize document replacement without locking other policy documents.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sourcePath}, 0))`;
    for (const chunk of chunks) {
      const vector = JSON.stringify(chunk.embedding);
      const metadata = JSON.stringify({ ...chunk.metadata, section: chunk.section, source_path: sourcePath });
      await tx.$executeRaw`
        INSERT INTO public.policy_chunks
          (document_name, section, content, source_path, chunk_key, content_hash,
           version, effective_from, metadata, embedding_model, embedding)
        VALUES (${chunk.documentName}, ${chunk.section}, ${chunk.content}, ${sourcePath},
          ${chunk.chunkKey}, ${contentHash(chunk.content)}, ${chunk.version},
          ${chunk.effectiveFrom}::date, ${metadata}::jsonb, ${EMBEDDING_MODEL}, ${vector}::extensions.vector)
        ON CONFLICT (source_path, chunk_key) DO UPDATE SET
          document_name = EXCLUDED.document_name, section = EXCLUDED.section,
          content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
          version = EXCLUDED.version, effective_from = EXCLUDED.effective_from,
          metadata = EXCLUDED.metadata, embedding_model = EXCLUDED.embedding_model,
          embedding = EXCLUDED.embedding
      `;
    }
    const keys = JSON.stringify(chunks.map(chunk => chunk.chunkKey));
    return tx.$executeRaw`
      DELETE FROM public.policy_chunks
      WHERE source_path = ${sourcePath}
        AND chunk_key NOT IN (SELECT jsonb_array_elements_text(${keys}::jsonb))
    `;
  }, { timeout: 60_000 });
}

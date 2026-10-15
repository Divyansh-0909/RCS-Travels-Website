import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import embed, { EMBEDDING_MODEL, validateEmbedding } from './embedder.ts';

export const QuestionSchema = z.string().trim().min(1).max(2000);
export const AudienceSchema = z.enum(['rider', 'captain']);
export type Audience = z.infer<typeof AudienceSchema>;
export const SearchOptionsSchema = z.object({
  audience: AudienceSchema.default('rider'),
  limit: z.number().int().min(1).max(8).default(6),
  minSimilarity: z.number().finite().min(0).max(1).default(0.3),
}).strict();
export type SearchOptions = z.input<typeof SearchOptionsSchema>;

const PolicyRowSchema = z.object({
  id: z.string(), document_name: z.string(), section: z.string(), content: z.string(),
  source_path: z.string(), chunk_key: z.string(), version: z.string(),
  effective_from: z.string().nullable(), metadata: z.record(z.string(), z.unknown()),
  similarity: z.number().finite().min(-1).max(1),
});
export type PolicyMatch = {
  id: string; documentName: string; section: string; content: string;
  sourcePath: string; chunkKey: string; version: string; effectiveFrom: string | null;
  metadata: Record<string, unknown>; similarity: number;
};
export type RetrievalResult = { status: 'ready' | 'not_ready'; matches: PolicyMatch[] };
export type RetrievalRequest = { question: string; options?: SearchOptions };
export type Retrieve = (request: RetrievalRequest) => Promise<RetrievalResult>;

export function createRetriever(db: PrismaClient, embedQuestion = embed): Retrieve {
  return async ({ question, options = {} }) => {
    const query = QuestionSchema.parse(question);
    const settings = SearchOptionsSchema.parse(options);
    // No provider request is useful when the compatible corpus has not loaded.
    const counts = await db.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM public.policy_chunks
      WHERE embedding_model = ${EMBEDDING_MODEL}
        AND source_path LIKE ${'backend/rcs-rag/documents/%'}
    `;
    if (!counts[0]?.count) return { status: 'not_ready', matches: [] };
    const embedding = await embedQuestion(query);
    validateEmbedding(embedding);
    if (!embedding.some(value => value !== 0)) throw new Error('Question embedding has zero magnitude');
    const vector = JSON.stringify(embedding);
    const rows = await db.$queryRaw<unknown[]>`
      WITH ranked AS (
        SELECT id::text AS id, document_name, section, content, source_path, chunk_key,
          version, effective_from::text AS effective_from, metadata,
          1 - (embedding OPERATOR(extensions.<=>) ${vector}::extensions.vector) AS similarity
        FROM public.policy_chunks
        WHERE embedding_model = ${EMBEDDING_MODEL}
          AND source_path LIKE ${'backend/rcs-rag/documents/%'}
          AND metadata->>'audience' IN (${settings.audience}, 'rider-and-captain')
      )
      SELECT * FROM ranked
      WHERE similarity BETWEEN ${settings.minSimilarity} AND 1
      ORDER BY similarity DESC, source_path ASC, chunk_key ASC
      LIMIT ${settings.limit}
    `;
    const matches: PolicyMatch[] = [];
    const identities = new Set<string>();
    for (const candidate of rows) {
      const parsed = PolicyRowSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const row = parsed.data;
      const identity = JSON.stringify([row.source_path, row.chunk_key]);
      // Validate at the service boundary as well as in SQL.
      if (row.similarity < settings.minSimilarity ||
        !row.source_path.startsWith('backend/rcs-rag/documents/') ||
        ![settings.audience, 'rider-and-captain'].includes(String(row.metadata.audience)) ||
        identities.has(identity)) continue;
      identities.add(identity);
      matches.push({ id: row.id, documentName: row.document_name, section: row.section,
        content: row.content, sourcePath: row.source_path, chunkKey: row.chunk_key,
        version: row.version, effectiveFrom: row.effective_from,
        metadata: row.metadata, similarity: row.similarity });
    }
    return { status: 'ready', matches: matches.slice(0, settings.limit) };
  };
}

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, dirname } from 'node:path';
import dotenv from 'dotenv';
import { chunkPolicy } from '../services/chunker.ts';
import embed, { EMBEDDING_MODEL, validateEmbedding } from '../services/embedder.ts';
import { contentHash, existingEmbeddings, storeDocument } from '../services/repository.ts';

const backendRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const documentsRoot = fileURLToPath(new URL('../../documents/', import.meta.url));
dotenv.config({ path: resolve(backendRoot, '.env'), quiet: true });

export function prepareDocuments() {
  const files = readdirSync(documentsRoot).filter(file => file.endsWith('.md')).sort();
  if (!files.length) throw new Error('No policy documents found');
  return files.map(documentName => {
    const file = resolve(documentsRoot, documentName);
    const markdown = readFileSync(file, 'utf8');
    const sourcePath = relative(dirname(backendRoot), file).replaceAll('\\', '/');
    const chunks = chunkPolicy(markdown, { source: documentName });
    if (!chunks.length) throw new Error(`No chunks produced for ${documentName}`);
    return { file, documentName, sourcePath, documentHash: contentHash(markdown), chunks };
  });
}

export async function loadPolicies(db, embedText = embed, report = console.log) {
  // Validate every document before provider calls or changes to stored rows.
  const documents = prepareDocuments();
  const totals = { documents: documents.length, chunks: 0, embedded: 0, reused: 0, removed: 0 };
  for (const document of documents) {
    const existing = new Map((await existingEmbeddings(db, document.sourcePath)).map(row => [row.chunk_key, row]));
    const stored = [];
    for (const chunk of document.chunks) {
      const prior = existing.get(chunk.chunkKey);
      let embedding;
      if (prior?.content_hash === contentHash(chunk.content) && prior.embedding_model === EMBEDDING_MODEL) {
        embedding = JSON.parse(prior.embedding);
        validateEmbedding(embedding);
        totals.reused++;
      } else {
        embedding = await embedText(chunk.content);
        validateEmbedding(embedding);
        totals.embedded++;
      }
      stored.push({ ...chunk, documentName: document.documentName, sourcePath: document.sourcePath, embedding });
    }
    if (contentHash(readFileSync(document.file, 'utf8')) !== document.documentHash) {
      throw new Error(`Document changed during embedding: ${document.documentName}; rerun the loader`);
    }
    totals.removed += await storeDocument(db, document.sourcePath, stored);
    totals.chunks += stored.length;
    report(`Loaded ${document.documentName}: ${stored.length} chunks`);
  }
  return totals;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: loader.js [--dry-run]');
  if (args.includes('--dry-run')) {
    const documents = prepareDocuments();
    console.log(JSON.stringify({ dryRun: true, documents: documents.length,
      chunks: documents.reduce((count, document) => count + document.chunks.length, 0) }));
    return;
  }
  const { prisma } = await import('../../../db/prisma.js');
  try { console.log(JSON.stringify(await loadPolicies(prisma))); }
  finally { await prisma.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Provider/database errors may contain URLs, headers, or request data.
    const code = typeof error?.code === 'string' ? error.code : 'RAG_LOAD_FAILED';
    console.error(JSON.stringify({ error: code }));
    process.exitCode = 1;
  });
}

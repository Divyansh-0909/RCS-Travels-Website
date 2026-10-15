import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { createDatabasePolicyAssistant } from '../services/ask-policy.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log('Usage: npm --prefix backend run rag:ask -- rider|captain "Your policy question"');
    console.log('This command uses the configured embedding and answer APIs when the corpus is loaded.');
    return;
  }
  if (args.length !== 2 || !['rider', 'captain'].includes(args[0])) {
    throw new Error('Expected rider|captain and one quoted question');
  }
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  const { prisma } = await import('../../../db/prisma.js');
  try {
    const answer = await createDatabasePolicyAssistant(prisma)({
      question: args[1], options: { audience: args[0] as 'rider' | 'captain' },
    });
    console.log(JSON.stringify(answer, null, 2));
    if (answer.status === 'not_ready' || answer.status === 'provider_unavailable' || answer.status === 'invalid_answer') process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(JSON.stringify({ error: 'RAG_ASK_FAILED' }));
    process.exitCode = 1;
  });
}

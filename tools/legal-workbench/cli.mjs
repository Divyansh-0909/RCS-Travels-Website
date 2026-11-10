import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWorkbench, ROOT, TOOLS, VERSION } from './workbench.mjs';

const [command = 'help', ...args] = process.argv.slice(2);
const call = createWorkbench();
try {
  let result;
  if (command === 'help') {
    result = { commands: ['tools', 'profile', 'sources [jurisdiction]', 'matrix [topic]', 'gaps [category]', 'documents [id]', 'review', 'report', 'call <tool> <arguments-json-file>', 'export <new-directory>'], note: 'No network, API key, external model, telemetry or arbitrary repository reads. The call command reads only the explicitly named JSON input file. export creates new files without overwriting existing ones.' };
  } else if (command === 'tools') result = TOOLS;
  else if (command === 'profile') result = await call('legal_profile');
  else if (command === 'sources') result = await call('legal_sources', args[0] ? { jurisdiction: args[0] } : {});
  else if (command === 'matrix') result = await call('legal_jurisdiction_matrix', args[0] ? { topic: args[0] } : {});
  else if (command === 'gaps') result = await call('legal_gap_report', args[0] ? { category: args[0] } : {});
  else if (command === 'documents') result = await call('legal_document', args[0] ? { id: args[0] } : {});
  else if (command === 'call') {
    if (args.length !== 2) throw new Error('Usage: call <tool> <arguments-json-file>');
    const input = await readFile(args[1], 'utf8');
    if (input.length > 500_000) throw new Error('Input JSON is too large');
    result = await call(args[0], JSON.parse(input));
  } else if (command === 'review' || command === 'report') {
    const { documents } = await call('legal_document');
    const reviews = [];
    for (const id of documents) {
      const { text } = await call('legal_document', { id });
      reviews.push({ id, ...(await call('legal_policy_review', { text })) });
    }
    result = { packageVersion: VERSION, reviews, adoptionStatus: 'not-adopted', legalClearance: false };
    if (command === 'report') {
      result.sources = await call('legal_sources');
      result.requirements = await call('legal_jurisdiction_matrix');
      result.gaps = await call('legal_gap_report');
    }
  } else if (command === 'export') {
    if (args.length !== 1) throw new Error('Usage: export <new-directory>');
    const destination = path.resolve(args[0]);
    // A new directory and wx files avoid silently replacing earlier documents.
    await mkdir(destination, { recursive: false });
    await mkdir(path.join(destination, 'documents'));
    await mkdir(path.join(destination, 'data'));
    const { documents } = await call('legal_document');
    for (const id of documents) {
      const { text } = await call('legal_document', { id });
      await writeFile(path.join(destination, 'documents', `${id}.md`), text, { encoding: 'utf8', flag: 'wx' });
    }
    await writeFile(path.join(destination, 'README.md'), await readFile(path.join(ROOT, 'DOCUMENTS.md')), { flag: 'wx' });
    for (const filename of ['RESEARCH.md', 'ADOPTION.md']) await writeFile(path.join(destination, filename), await readFile(path.join(ROOT, filename)), { flag: 'wx' });
    for (const filename of ['profile', 'sources', 'requirements', 'gaps']) await writeFile(path.join(destination, 'data', `${filename}.json`), await readFile(path.join(ROOT, 'data', `${filename}.json`)), { flag: 'wx' });
    result = { directory: destination, documents: documents.length, status: 'candidates-not-adopted' };
  } else throw new Error('Unknown command; use help');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
}

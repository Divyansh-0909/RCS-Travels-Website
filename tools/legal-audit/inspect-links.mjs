import { readFile } from 'node:fs/promises';
const [filename, search = '.pdf'] = process.argv.slice(2);
const text = await readFile(filename, 'utf8');
const result = new Set();
const expressions = [/\b(?:href|src)\s*=\s*["']([^"']+)["']/giu, /["'`]([^"'`\s<>]{1,500}\.(?:pdf|js)(?:\?[^"'`\s<>]*)?)["'`]/giu];
for (const expression of expressions) for (const match of text.matchAll(expression)) if (match[1].length <= 1000 && !match[1].startsWith('data:') && match[1].toLowerCase().includes(search.toLowerCase())) result.add(match[1].replace(/&amp;/gu, '&'));
process.stdout.write(`${JSON.stringify([...result].slice(0, 70), null, 2)}\n`);

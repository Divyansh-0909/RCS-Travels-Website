import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function readSource(file) {
  const resolved = fs.realpathSync(path.resolve(root, file));
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Read must stay inside the repository.');
  if (/(^|[/\\])(\.env[^/\\]*|\.git|node_modules|dist|build|data|secrets?|credentials?)([/\\]|$)|\.(pem|key|p12|db|sqlite|csv)$/i.test(relative)) throw new Error('Excluded source path.');
  if (fs.statSync(resolved).size > 2_000_000) throw new Error('File exceeds 2 MB; use a scoped source search.');
  const source = fs.readFileSync(resolved, 'utf8');
  if (source.includes('\0')) throw new Error('Binary input is not supported.');
  return source.split(/\r?\n/);
}

export function render(lines, mode, arg, count) {
  let selected;
  if (mode === 'read') {
    const start = Number(arg ?? 1), limit = Number(count ?? 120);
    if (!Number.isInteger(start) || start < 1 || !Number.isInteger(limit) || limit < 1 || limit > 350) throw new Error('Use a positive start and a limit of 1–350 lines.');
    selected = lines.map((text, i) => [i + 1, text]).slice(start - 1, start - 1 + limit);
  } else if (mode === 'find' || mode === 'outline') {
    if (mode === 'find' && !arg) throw new Error('find requires a literal search term.');
    const outline = /^\s*(?:#{1,6}\s|(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|interface|type|enum|const|let)\s|(?:import|export)\s|(?:model|enum)\s|(?:router|app)\.(?:get|post|put|patch|delete)\s*\()/;
    selected = lines.map((text, i) => [i + 1, text]).filter(([, text]) => mode === 'find' ? text.toLowerCase().includes(arg.toLowerCase()) : outline.test(text));
  } else throw new Error('Usage: node tools/token-guard/read.mjs <outline|find|read> <file> [term|start] [limit]');
  const output = [`${lines.length} source lines; ${selected.length} selected (outline is heuristic).`];
  let chars = output[0].length;
  for (const [line, text] of selected.slice(0, 350)) {
    const row = `${line}: ${text.length > 300 ? text.slice(0, 300) + ' … [line clipped]' : text}`;
    if (chars + row.length > 12000) break;
    output.push(row); chars += row.length + 1;
  }
  if (output.length - 1 < selected.length) output.push('[Output capped; narrow the search or read a specific range.]');
  return output.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, file, arg, count] = process.argv.slice(2);
    if (!file) throw new Error('Specify mode and repository-relative file.');
    console.log(render(readSource(file), mode, arg, count));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

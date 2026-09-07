import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const redirect = 'Token guard: bulk read exceeds 350 lines or 12 KB. Use node tools/token-guard/read.mjs outline <file>, find <file> <literal>, or read <file> <start> <limit> (max 350). Read exact relevant source before editing; do not reconstruct the whole file through repeated chunks.';
export function check(event) {
  const input = event.tool_input ?? {};
  const cwd = input.workdir ?? event.cwd ?? process.cwd();
  const large = (file) => {
    try {
      const target = path.resolve(cwd, file);
      const stat = fs.statSync(target);
      if (!stat.isFile()) return false;
      return stat.size > 12000 || fs.readFileSync(target, 'utf8').split(/\r?\n/).length > 350;
    } catch { return false; }
  };
  if (/^(Read|read_file)$/.test(event.tool_name ?? '')) {
    if (!input.limit && large(input.file_path ?? input.path ?? '')) return redirect;
    if (Number(input.limit) > 350) return redirect;
  }
  if (!/^(Bash|exec_command|shell_command|shell)$/.test(event.tool_name ?? '')) return null;
  const command = input.command ?? input.cmd ?? '';
  if (typeof command !== 'string') return null;
  // Deliberately recognize simple literal reads, not arbitrary shell programs.
  for (const segment of command.split(/[;\n]|&&|\|\|/)) {
    const match = segment.trim().match(/^(?:Get-Content|gc|cat|type|head|tail|less|more)\s+(.*)$/i);
    if (!match) continue;
    const args = match[1].match(/"[^"]*"|'[^']*'|[^\s|]+/g) ?? [];
    const bounded = match[1].match(/(?:-TotalCount|-Head|-Tail|-First|-Last|-n)\s+(\d+)/i);
    if (bounded && Number(bounded[1]) <= 350) continue;
    for (const token of args) {
      if (token.startsWith('-')) continue;
      if (large(token.replace(/^['"]|['"]$/g, ''))) return redirect;
    }
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const reason = check(JSON.parse(fs.readFileSync(0, 'utf8')));
    console.log(JSON.stringify(reason ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } } : {}));
  } catch { console.error('Token guard could not inspect this call; continuing.'); }
}

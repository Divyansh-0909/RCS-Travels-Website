import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { replaceCheckpoint } from './atomic-replace.mjs';

export const STATES = Object.freeze(['PROMPT_READY', 'CODEX_RUNNING', 'OUTPUT_READY', 'AWAITING_REVIEW', 'CORRECTION_REQUIRED', 'APPROVAL_REQUIRED', 'PAUSED_USAGE_LIMIT', 'PAUSED_OFFLINE', 'PAUSED_AUTH', 'FAILED']);
export const now = () => new Date().toISOString();
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { replaceCheckpoint(temp, file); }
  catch (error) {
    try { fs.unlinkSync(temp); } catch { /* Preserve the original error and destination. */ }
    throw error;
  }
}
export const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
};
export function initialState() {
  return { schema: 1, state: 'PROMPT_READY', action: 'Waiting for an explicitly ready prompt', phases: {}, bootstrap: null, run: null, candidate: null, heartbeat: now(), updatedAt: now(), connections: {}, history: [] };
}
export function transition(state, status, action, extra = {}) {
  if (!STATES.includes(status)) throw new Error('Unknown handoff state');
  Object.assign(state, extra, { state: status, action, updatedAt: now() });
  state.history = [...state.history, { state: status, action, at: state.updatedAt }].slice(-60);
  return state;
}
export function documentText(doc) {
  const blocks = [];
  const walk = content => { for (const item of content || []) {
    if (item.paragraph) blocks.push(item.paragraph.elements.map(e => e.textRun?.content || '').join(''));
    for (const row of item.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
  } };
  const tabs = list => { for (const tab of list || []) { walk((tab.documentTab || tab).body?.content); tabs(tab.childTabs); } };
  if (doc.tabs?.length) tabs(doc.tabs); else walk(doc.body?.content);
  return blocks.join('');
}
// Readiness comes from a phase header and its immediate status, never text color or an output report.
export function readyPrompt(text) {
  text = text.replace(/\r\n/g, '\n');
  const headers = [...text.matchAll(/^(P\d{2,})\s*\|\s*(.+)$/gm)];
  const candidates = [];
  for (let i = 0; i < headers.length; i++) {
    const match = headers[i];
    const rest = text.slice(match.index, headers[i + 1]?.index ?? text.length);
    const prefix = rest.split('\n').slice(1, 8).join('\n');
    const status = prefix.match(/^STATUS:\s*(PROMPT_READY|ACTIVE(?:\s*\/\s*AWAITING CODEX OUTPUT)?|CORRECTION_REQUIRED)\s*$/m)?.[1];
    if (!status) continue;
    const version = Number(prefix.match(/^VERSION:\s*(\d+)\s*$/m)?.[1] || 1);
    // P01's historical output placeholders and later worker appends are excluded from its fingerprint.
    let body = rest.split(/^(?:\d+\. Codex output block|CODEX (?:OUTPUT|HANDOFF|STATUS(?: EVENT)?)\b|CHATGPT REVIEW\b|P\d{2,} REVIEW:)/m)[0];
    if (match[1] === 'P01') {
      body = body.split(/^5\. Codex output block/m)[0];
      for (const addendum of text.matchAll(/^P01 ADDENDUM — [\s\S]*?(?=^P01 ADDENDUM — |^CODEX (?:OUTPUT|HANDOFF|STATUS EVENT)\b|^P\d{2,}\s*\||$(?![\s\S]))/gm)) body += '\n' + addendum[0];
    }
    const approvalStart = text.indexOf('Allowed autonomy and approval gates');
    const sharedStart = approvalStart >= 0 ? approvalStart : text.indexOf('2. Product constraints locked');
    const sharedEnd = text.indexOf('3. Active Codex prompt');
    const shared = sharedStart >= 0 && sharedEnd > sharedStart ? text.slice(sharedStart, sharedEnd) : '';
    const content = `${shared}\n${body.trim()}`;
    candidates.push({ phase: match[1], version, key: `${match[1]}:v${version}`, title: match[2], status, content, hash: hash(content) });
  }
  return candidates.sort((a, b) => Number(b.phase.slice(1)) - Number(a.phase.slice(1)) || b.version - a.version)[0] || null;
}
export function disposition(state, prompt) {
  if (!prompt) return 'no-ready-prompt';
  if (state.bootstrap?.active) return 'bootstrap-owned';
  if (state.run && !['published', 'abandoned'].includes(state.run.stage)) return 'unfinished-run';
  const existing = state.phases[prompt.key];
  if (existing?.hash && existing.hash !== prompt.hash) return 'same-version-edited';
  if (existing) return 'already-dispatched';
  const earlier = Object.entries(state.phases).filter(([key]) => key.startsWith(prompt.phase + ':'));
  if (earlier.length && prompt.status !== 'CORRECTION_REQUIRED') return 'correction-status-required';
  return 'dispatch';
}
export function classifyError(error) {
  const s = `${error?.code || ''} ${error?.codex_error_info || ''} ${error?.message || error}`;
  if (/usage[ _-]?limit|quota|rate[ _-]?limit|insufficient_quota|429|limit has been reached|credits exhausted/i.test(s)) return 'PAUSED_USAGE_LIMIT';
  if (/401|403|invalid_grant|unauth|sign.in|log.in|credentials|permission.denied|access_token/i.test(s)) return 'PAUSED_AUTH';
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|offline|network|timeout|503|502/i.test(s)) return 'PAUSED_OFFLINE';
  return 'FAILED';
}
export function usageRetry(error, attempts = 0, timestamp = Date.now()) {
  if (attempts >= 3) return null;
  const numeric = error?.resets_at ?? error?.reset_at ?? error?.error?.resets_at;
  let reset = numeric ? (Number(numeric) < 1e12 ? Number(numeric) * 1000 : Number(numeric)) : NaN;
  if (!Number.isFinite(reset)) {
    const date = String(error?.message || '').match(/\b\d{4}-\d\d-\d\dT[\d:.]+Z\b/);
    if (date) reset = Date.parse(date[0]);
  }
  return new Date(Math.max(timestamp + 60_000, Number.isFinite(reset) ? reset + 60_000 : timestamp + 6 * 3600_000 * 2 ** attempts)).toISOString();
}
export function lock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = crypto.randomUUID();
  const record = { pid: process.pid, token, at: now() };
  // Atomic mkdir cannot be replaced by a stale-lock contender on Windows.
  try { fs.mkdirSync(file); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = readJson(path.join(file, 'owner.json'), null);
    if (owner ? alive(owner.pid) : Date.now() - fs.statSync(file).mtimeMs < 30_000) throw new Error('Another worker owns the repository lock (or is starting)');
    const tomb = `${file}.stale.${crypto.randomUUID()}`;
    fs.renameSync(file, tomb);
    try { fs.mkdirSync(file); } catch { throw new Error('Another worker acquired the repository lock'); }
  }
  atomicJson(path.join(file, 'owner.json'), record);
  return () => {
    if (readJson(path.join(file, 'owner.json'), null)?.token === token) {
      fs.unlinkSync(path.join(file, 'owner.json')); fs.rmdirSync(file);
    }
  };
}
export function redInsertion(doc, text) {
  const tab = doc.tabs?.[0];
  const tabId = tab?.tabProperties?.tabId || tab?.tabId;
  const content = (tab?.documentTab || tab)?.body?.content || doc.body.content;
  const index = content.at(-1).endIndex - 1;
  const range = { startIndex: index, endIndex: index + text.length, ...(tabId ? { tabId } : {}) };
  return [
    { insertText: { location: { index, ...(tabId ? { tabId } : {}) }, text } },
    { updateTextStyle: { range, textStyle: { foregroundColor: { color: { rgbColor: { red: 180 / 255, green: 35 / 255, blue: 46 / 255 } } } }, fields: 'foregroundColor' } },
  ];
}

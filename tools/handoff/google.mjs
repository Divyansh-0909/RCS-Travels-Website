import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { documentText, redInsertion, hash } from './core.mjs';
const exec = promisify(execFile);
export class Google {
  constructor(config) { this.config = config; this.cached = null; }
  async token(force = false) {
    if (!force && this.cached?.expires > Date.now()) return this.cached.value;
    const args = ['auth', 'print-access-token', '--quiet', ...(this.config.googleAccount ? [`--account=${this.config.googleAccount}`] : [])];
    // Credentials stay in Google's existing OS profile. Never log token output or write it to the repo.
    let result;
    try {
      const command = this.config.gcloudPath || 'gcloud';
      if (process.platform === 'win32') {
        if (!/^[\w @.:/\\-]+$/.test(command) || args.some(a => !/^[\w@.:/=+-]+$/.test(a))) throw new Error('Invalid Google CLI configuration');
        result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& '${command.replace(/'/g, "''")}' ${args.map(a => `'${a}'`).join(' ')}`], { windowsHide: true, timeout: 30_000 });
      } else result = await exec(command, args, { timeout: 30_000 });
    } catch { throw new Error('Google credentials unavailable; run the documented Drive sign-in command'); }
    this.cached = { value: result.stdout.trim(), expires: Date.now() + 45 * 60_000 };
    return this.cached.value;
  }
  async request(url, options = {}, retried = false) {
    let response;
    try { response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(30_000) }); }
    catch (e) { if (/credentials/.test(e.message)) throw e; throw new Error('Google network request failed'); }
    if (response.status === 401 && !retried) { this.cached = null; return this.request(url, options, true); }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const reason = body.error?.errors?.[0]?.reason || body.error?.status || '';
      // Do not echo response bodies, request headers or credential errors.
      const e = new Error(`Google HTTP ${response.status} ${reason}`); e.httpStatus = response.status; throw e;
    }
    return response.status === 204 ? null : response.json();
  }
  metadata(id) { return this.request(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,parents,version,modifiedTime,webViewLink,capabilities(canEdit,canAddChildren)`); }
  document() { return this.request(`https://docs.googleapis.com/v1/documents/${this.config.documentId}?includeTabsContent=true`); }
  async changes(cursor) {
    if (!cursor) return this.request('https://www.googleapis.com/drive/v3/changes/startPageToken');
    return this.request(`https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(cursor)}&pageSize=100&fields=nextPageToken,newStartPageToken,changes(fileId,removed,file(id,parents,modifiedTime))`);
  }
  async appendRed(text, marker) {
    // Reconcile a lost HTTP response before retrying an insertion.
    const doc = await this.document();
    if (marker && documentText(doc).includes(marker)) return { alreadyPresent: true };
    return this.request(`https://docs.googleapis.com/v1/documents/${this.config.documentId}:batchUpdate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writeControl: { requiredRevisionId: doc.revisionId }, requests: redInsertion(doc, text) }),
    });
  }
  async screenshotFolder(phase) {
    this.screenshotFolders ||= new Map();
    if (this.screenshotFolders.has(phase)) return this.screenshotFolders.get(phase);
    if (!/^P\d{2,}$/.test(phase)) throw new Error('Invalid screenshot phase');
    const q = `'${this.config.folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${phase}-screenshots'`;
    const existing = (await this.request(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=100`)).files[0];
    const folder = existing || await this.request('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${phase}-screenshots`, mimeType: 'application/vnd.google-apps.folder', parents: [this.config.folderId] }) });
    this.screenshotFolders.set(phase, folder.id); return folder.id;
  }
  async findArtifact(key, folderId = this.config.folderId) {
    const q = `'${folderId}' in parents and trashed=false and appProperties has { key='rcsHandoffKey' and value='${key}' }`;
    return (await this.request(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents,webViewLink)&pageSize=100`)).files[0];
  }
  async upload(file, runId, mime = 'text/markdown', phase) {
    const bytes = fs.readFileSync(file);
    const key = hash(`${runId}:${path.basename(file)}:${hash(bytes)}`);
    const folderId = mime.startsWith('image/') && phase ? await this.screenshotFolder(phase) : this.config.folderId;
    const existing = await this.findArtifact(key, folderId);
    if (existing) return this.verifyArtifact(existing.id);
    const boundary = 'rcs_' + crypto.randomBytes(16).toString('hex');
    const meta = { name: path.basename(file), parents: [folderId], appProperties: { rcsHandoffKey: key, rcsRunId: runId } };
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const result = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents,webViewLink', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return this.verifyArtifact(result.id);
  }
  async verifyArtifact(id) {
    const meta = await this.metadata(id);
    if (!meta.parents?.includes(this.config.folderId)) {
      const parent = meta.parents?.[0] && await this.metadata(meta.parents[0]);
      if (!parent || !parent.parents?.includes(this.config.folderId) || !/^P\d{2,}-(?:screenshots|evidence)$/.test(parent.name)) throw new Error('Artifact uploaded outside the handoff folder');
    }
    // Reading media proves the uploaded object is readable, not just that its title exists.
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Artifact readback HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { id: meta.id, name: meta.name, url: meta.webViewLink || `https://drive.google.com/file/d/${meta.id}/view`, sha256: hash(bytes), bytes: bytes.length };
  }
  remove(id) { return this.request(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' }); }
}

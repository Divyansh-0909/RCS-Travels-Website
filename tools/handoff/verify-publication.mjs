import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Google } from './google.mjs';
import { config } from './config.mjs';
import { atomicJson, readJson, hash, documentText, readyPrompt, now } from './core.mjs';
const google = new Google(config);
const green = [24,113,60], red = [180,35,46];
function colored(doc, rgb) {
  let output = '';
  const walk = elements => { for (const e of elements || []) {
    for (const run of e.paragraph?.elements || []) {
      const color = run.textRun?.textStyle?.foregroundColor?.color?.rgbColor;
      if (color && Math.abs(color.red-rgb[0]/255)<.0001 && Math.abs(color.green-rgb[1]/255)<.0001 && Math.abs(color.blue-rgb[2]/255)<.0001) output += run.textRun.content;
    }
    for (const row of e.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
  } };
  for (const tab of doc.tabs || []) walk((tab.documentTab || tab).body?.content);
  return output;
}
const snapshotFile = path.join(config.runtime, 'pre-publication.json');
if (process.argv[2] === 'prepare') {
  const doc = await google.document(), text = colored(doc, green);
  atomicJson(snapshotFile, { at: now(), greenLength: text.length, greenHash: hash(text), revision: doc.revisionId });
  console.log('Green-history preservation snapshot saved.');
} else {
  const state = readJson(path.join(config.runtime, 'state.json')), run = state.run;
  assert.equal(run.stage, 'published'); assert.equal(state.state, 'AWAITING_REVIEW');
  const before = readJson(snapshotFile), doc = await google.document();
  assert.equal(hash(colored(doc, green).slice(0, before.greenLength)), before.greenHash);
  const marker = `RCS_OUTPUT_RUN: ${run.id}`;
  assert.ok(colored(doc, red).includes(marker)); assert.ok(colored(doc, red).includes('STATUS: OUTPUT_READY'));
  assert.ok(colored(doc, red).includes('BASELINE / UNRESOLVED CHECKS:'));
  const manifest = await google.verifyArtifact(run.manifest.id);
  assert.equal(manifest.sha256, hash(fs.readFileSync(path.join(run.directory, 'artifact-manifest.json'))));
  const active = readyPrompt(documentText(doc));
  if (active?.phase === run.phase) assert.equal(active.hash, run.hash);
  const proof = { author: 'CODEX', phase: run.phase, at: now(), artifacts: run.artifacts.length, manifest: manifest.url, state: state.state, greenPreserved: true, codexOutputRed: true, unresolvedFailuresDisclosed: true, currentReadyPhase: active?.phase, bootstrapActive: state.bootstrap.active };
  atomicJson(path.join(config.runtime, 'publication-verification.json'), proof); console.log(JSON.stringify(proof, null, 2));
}

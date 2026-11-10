import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from './config.mjs';
import { Google } from './google.mjs';
import { now, atomicJson, documentText, readyPrompt } from './core.mjs';

const google = new Google(config);
const before = await google.document();
const textBefore = documentText(before), promptBefore = readyPrompt(textBefore);
const marker = 'RCS_BOOTSTRAP_CONNECTION_VERIFIED_2026_10_21';
const colorText = (doc, channel) => {
  let text = '';
  function walk(content) { for (const e of content || []) {
    for (const r of e.paragraph?.elements || []) {
      const rgb = r.textRun?.textStyle?.foregroundColor?.color?.rgbColor;
      if (rgb && Math.abs(rgb.red - channel[0] / 255) < .0001 && Math.abs(rgb.green - channel[1] / 255) < .0001 && Math.abs(rgb.blue - channel[2] / 255) < .0001) text += r.textRun.content;
    }
    for (const row of e.table?.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
  } }
  for (const tab of doc.tabs || []) walk((tab.documentTab || tab).body?.content);
  return text;
};
const greenBefore = colorText(before, [24, 113, 60]);
const folder = await google.metadata(config.folderId); assert.equal(folder.capabilities.canAddChildren, true);
const file = path.join(config.runtime, 'P01-connection-test.md');
fs.writeFileSync(file, `AUTHOR: CODEX\nPHASE: P01\nSafe temporary connection test, ${now()}. No customer or credential data.\n`);
let uploaded;
try {
  uploaded = await google.upload(file, 'connection-test-20261021');
  assert.ok(uploaded.bytes > 0);
  await google.appendRed(`\nCODEX HANDOFF — P01 CONNECTION STATUS\n${marker}\nAUTHOR: CODEX | PHASE: P01\nSTATUS: CODEX_RUNNING\nGoogle Drive/Docs local API read and artifact upload/readback verified. Existing ChatGPT green text is preserved. P01 is registered to the current bootstrap session; the watcher must not launch a duplicate P01 agent. Infrastructure and original P01 verification are still in progress. The existing hourly ChatGPT review is unchanged.\n`, marker);
  const after = await google.document();
  assert.equal(colorText(after, [24, 113, 60]), greenBefore);
  assert.ok(colorText(after, [180, 35, 46]).includes(marker));
  assert.equal(readyPrompt(documentText(after)).hash, promptBefore.hash);
  const proof = { at: now(), active: promptBefore.key, localAuth: true, changesFeed: Boolean((await google.changes()).startPageToken), uploadReadback: uploaded, greenPreserved: true, redInsertionVerified: true, promptHashUnchanged: true, bootstrapGuard: true, testArtifactDeleted: false };
  await google.remove(uploaded.id); proof.testArtifactDeleted = true; uploaded = null;
  atomicJson(path.join(config.runtime, 'live-connection-verification.json'), proof);
  console.log(JSON.stringify(proof, null, 2));
} finally {
  if (uploaded) await google.remove(uploaded.id);
  fs.unlinkSync(file);
}

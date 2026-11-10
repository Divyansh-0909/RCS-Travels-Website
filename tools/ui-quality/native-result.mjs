import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { atomicJson, now, readJson } from '../handoff/core.mjs';
const run = process.argv[2];
if (!/^\d{17}-[a-f0-9-]{36}$/.test(run || '')) throw new Error('Supply the exact isolated native run ID');
const directory = path.join(config.root, 'output/phase9-native-device-2026-10-10', run);
const receipt = readJson(path.join(directory, 'receipt.json'), null);
const failure = readJson(path.join(directory, 'failure.json'), null);
const identity = readJson(path.join(directory, 'native-source-identities.json'), null);
const acceptanceLog = fs.existsSync(path.join(directory, 'accept-failure-and-retry.log')) ? fs.readFileSync(path.join(directory, 'accept-failure-and-retry.log'), 'utf8') : '';
if (!receipt && !failure) throw new Error('Native run has not reached a verified terminal result');
const proof = {
  author: 'CODEX', phase: 'P01', at: now(), run, command: 'node backend/tests/run-phase9-native.js --keep-awake',
  status: receipt?.status === 'PASS' ? 'PASS' : 'FAILED',
  scope: receipt?.scope || 'Isolated native startup/journey verification',
  actions: (receipt?.actions || failure?.actions || []).map(a => ({ actor: a.actor, action: a.action, status: a.status })),
  error: failure?.error || null,
  failedAssertion: acceptanceLog.match(/^Assertion is false:\s*(.+)$/m)?.[1] || null,
  package: receipt?.build?.package || 'com.rcstravels.driver.phase9',
  apkSha256: receipt?.build?.apkSha256 || failure?.build || identity?.apkSha256 || null,
  controlledFaultsObserved: (receipt?.faults || failure?.faults || []).length,
  acceptResponses: (receipt?.requests || failure?.requests || []).filter(r => r.path?.endsWith('/accept')).map(r => ({ method: r.method, status: r.status })),
  bundlePreflight: readJson(path.join(directory, 'bundle-preflight.json'), null),
  productionTouched: false, syntheticAccountsAndBackend: true,
  themesAndAllScreensApproved: false, usbKeepAwakeLeftEnabled: true,
  ios: 'NOT RUN: no iOS simulator on Windows',
};
atomicJson(path.join(config.runtime, 'native-verification.json'), proof);
console.log(JSON.stringify(proof, null, 2));

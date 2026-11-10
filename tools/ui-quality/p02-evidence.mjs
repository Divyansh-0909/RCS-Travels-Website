import fs from 'node:fs';
import path from 'node:path';
import { config } from '../handoff/config.mjs';
import { atomicJson, readJson, hash } from '../handoff/core.mjs';
import { physicalDevice } from '../phase9-native/device.mjs';

const state = readJson(path.join(config.runtime, 'state.json'));
if (state.run.phase !== 'P02' || !state.bootstrap.active) throw Error('P02 must be owned by this session');
const artifacts = path.join(state.run.directory, 'artifacts');
const device = await physicalDevice();
const scrubString = value => value.replaceAll(device.serial, '[device-serial-redacted]')
  .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
  .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[JWT redacted]')
  .replace(/\b(?:sk|pk)_(?:test|live)_[\w-]+/g, '[key redacted]');
function scrub(value) {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) =>
    [key, /serial|udid|authorization|cookie|password|access_token|refresh_token/i.test(key) ? '[redacted]' : scrub(val)]));
  return value;
}
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const runs = readJson(path.join(config.runtime, 'P02-runs.json'));
const proofs = {};
let logs = '# P02 native execution logs\n\nAUTHOR: CODEX\nPHASE: P02\n\nOnly synthetic-test app/Metro and Maestro flow logs are included. Device identifiers and credentials are redacted. Other applications’ logcat records are excluded.\n';
for (const [label, id] of Object.entries(runs)) {
  const directory = path.join(config.root, 'output/phase9-native-device-2026-10-10', id);
  const receipt = readJson(path.join(directory, 'receipt.json'), null);
  const failure = readJson(path.join(directory, 'failure.json'), null);
  const identity = readJson(path.join(directory, 'native-source-identities.json'));
  const files = walk(path.join(directory, 'maestro-artifacts'));
  const commands = files.filter(file => /accept-failure-and-retry[\\/]commands\.json$/.test(file)).flatMap(file => readJson(file).map(row => ({
    command: Object.fromEntries(Object.entries(row.command).filter(([key]) => !['defineVariablesCommand', 'applyConfigurationCommand'].includes(key))),
    status: row.metadata.status, at: new Date(row.metadata.timestamp).toISOString(), durationMs: row.metadata.duration,
    error: row.metadata.error?.message,
  })).filter(row => Object.keys(row.command).length));
  const hierarchies = files.filter(file => /accept-failure-and-retry[\\/]screen-hierarchy[\\/].*\.json$/.test(file))
    .map(file => ({ name: path.basename(file), hierarchy: readJson(file) }));
  const yamlAt = fs.statSync(path.join(directory, 'accept-failure-and-retry.yaml')).mtimeMs;
  const proof = scrub({ author: 'CODEX', phase: 'P02', label, run: id,
    status: receipt?.status || 'FAILED', error: failure?.error,
    theme: receipt?.theme || 'pre-existing dark preference',
    apkSha256: receipt?.apkSha256 || receipt?.build?.apkSha256 || failure?.build || identity.apkSha256,
    package: 'com.rcstravels.driver.phase9', stagedSources: identity.stagedSources,
    executorSourceHash: receipt?.sourceHash || receipt?.executorSource,
    bundle: readJson(path.join(directory, 'bundle-preflight.json')),
    yamlWrittenAt: new Date(yamlAt).toISOString(),
    unsynchronizedPanelDeadlineUpperBound: ['priorFailure', 'unchangedBaseline'].includes(label) ? new Date(yamlAt + 30000).toISOString() : undefined,
    actions: receipt?.actions, faults: receipt?.faults || failure?.faults,
    assigned: receipt?.assigned, walletBalance: receipt?.walletBalance,
    timeline: readJson(path.join(directory, 'acceptance-timeline.json'), null), commands, hierarchies,
    finalHierarchyXml: fs.existsSync(path.join(directory, 'acceptance-final-hierarchy.xml')) ? fs.readFileSync(path.join(directory, 'acceptance-final-hierarchy.xml'), 'utf8') : null,
    productionTouched: false, rawSystemLogcatUploaded: false,
  });
  proofs[label] = proof;
  atomicJson(path.join(artifacts, `P02-${label}-native-evidence.json`), proof);
  for (const file of files.filter(file => ['light', 'dark'].includes(label) && /accept-failure-and-retry[\\/]takeScreenshot[\\/].*\.png$/.test(file))) {
    fs.copyFileSync(file, path.join(artifacts, `P02-${label}-${path.basename(file)}`));
  }
  const selectedLogs = [path.join(directory, 'metro.log'), path.join(directory, 'accept-failure-and-retry.log')];
  for (const file of files.filter(file => /accept-failure-and-retry[\\/]logs[\\/]device-logcat\.txt$/.test(file))) {
    // Historical Maestro logcat is system-wide; an unattributed ReactNativeJS
    // tag could belong to another app. Include only records naming our package.
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(line => /com\.rcstravels\.driver\.phase9/.test(line));
    logs += `\n## ${label}: application-only logcat\n\n\`\`\`text\n${scrubString(lines.join('\n'))}\n\`\`\`\n`;
  }
  for (const file of selectedLogs) logs += `\n## ${label}: ${path.basename(file)}\n\n\`\`\`text\n${scrubString(fs.readFileSync(file, 'utf8'))}\n\`\`\`\n`;
}
fs.writeFileSync(path.join(artifacts, 'P02-native-execution-logs.md'), logs);
let testLogs = '# P02 targeted verification logs\n\nAUTHOR: CODEX\nPHASE: P02\n';
for (const name of ['P02-native-units.log', 'P02-hierarchy-tests.log', 'P02-bundle-preflight-tests.log', 'P02-handoff-tests.log', 'P02-viewer-check.log']) {
  testLogs += `\n## ${name}\n\n\`\`\`text\n${scrubString(fs.readFileSync(path.join(config.runtime, name), 'utf8'))}\n\`\`\`\n`;
}
fs.writeFileSync(path.join(artifacts, 'P02-targeted-verification-logs.md'), testLogs);
const productSource = fs.readFileSync(path.join(config.root, 'driver-app/src/components/OfferPanel.tsx'));
const baselineSource = fs.readFileSync(path.join(config.runtime, 'P02-source-baseline/driver-app/src/components/OfferPanel.tsx'));
if (hash(productSource) !== hash(baselineSource)) throw Error('The bounded fixture repair must not change the production offer panel');
atomicJson(path.join(artifacts, 'P02-evidence-summary.json'), {
  author: 'CODEX', phase: 'P02', at: new Date().toISOString(), runs,
  verdicts: Object.fromEntries(Object.entries(proofs).map(([label, proof]) => [label, proof.status])),
  offerPanelUnchanged: true, offerPanelSha256: hash(productSource),
  nativeDevice: { model: (await device.adb('shell', 'getprop', 'ro.product.model')).trim(),
    android: (await device.adb('shell', 'getprop', 'ro.build.version.release')).trim(),
    size: (await device.adb('shell', 'wm', 'size')).trim(), density: (await device.adb('shell', 'wm', 'density')).trim() },
});
console.log(JSON.stringify({ evidenceRuns: Object.keys(proofs), artifacts: fs.readdirSync(artifacts).length, productionOfferPanelUnchanged: true }));

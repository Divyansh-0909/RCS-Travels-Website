// Verify Android's actual accessibility state, using only the isolated test app.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { physicalDevice } from '../phase9-native/device.mjs';
import { captureNativeHierarchy } from '../../backend/tests/helpers/phase9NativeHierarchy.mjs';
import { readJson, atomicJson, hash } from '../handoff/core.mjs';

const execute = promisify(execFile), run = readJson('output/handoff/state.json').run;
assert.equal(run.phase, 'P04');
const out = path.join(run.directory, 'artifacts');
const identity = readJson('output/handoff/native-preview-session/native-source-identities.json');
const source = 'src/components/AppBar.tsx', sha256 = hash(fs.readFileSync(path.join('driver-app', source)));
assert.equal(hash(fs.readFileSync(path.join(identity.runtimeApp, source))), sha256, 'Native source must match the change');
const fixture = readJson('output/handoff/native-fixture.json');
assert(fixture.active && Date.now() - Date.parse(fixture.at) < 15000, 'Fresh isolated fixture required');
const device = await physicalDevice(), names = ['Home', 'Market', 'Rides', 'Account'];
const proof = { phase: 'P04', issue: 'A2', at: new Date().toISOString(), package: 'com.rcstravels.driver.phase9', source: { file: source, sha256 }, checks: [], screenshots: [] };
const nodes = xml => [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
const tree = async () => nodes(await captureNativeHierarchy(device));
const pause = () => new Promise(resolve => setTimeout(resolve, 800));
async function swipe(x, from, to) {
  assert.match(await device.adb('shell', 'dumpsys', 'activity', 'activities'), /(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//);
  await device.adb('shell', 'input', 'swipe', String(x), String(from), String(x), String(to), '2000');
  await pause();
}
async function tapName(name) {
  const list = await tree();
  const node = list.find(n => (n['content-desc'] === name || n['content-desc']?.startsWith(name + ',')) && n.clickable === 'true') || list.find(n => n.text === name && n.clickable === 'true');
  assert(node, 'Visible control required: ' + name);
  const [left, top, right, bottom] = node.bounds.match(/-?\d+/g).map(Number);
  assert(right > left && bottom > top);
  assert.match(await device.adb('shell', 'dumpsys', 'activity', 'activities'), /(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//);
  await device.adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
  await pause();
}
async function verify(active, name) {
  await execute(process.execPath, ['tools/handoff/p04-audit.mjs', name], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const report = readJson(path.join(out, 'P04-evidence', name + '.json'));
  if (active === 'Account') {
    const theme = name.includes('dark') ? 'Dark' : 'Light';
    assert(report.nodes.some(n => n.label === 'Appearance, ' + theme), 'Actual saved theme must be ' + theme);
  }
  const tabs = names.map(label => {
    const matches = report.nodes.filter(n => n.label === label && n.class === 'android.widget.Button' && n.clickable === 'true');
    assert.equal(matches.length, 1, 'Exactly one named button: ' + label);
    const node = matches[0];
    assert.equal(node.focusable, 'true', label + ' remains focusable');
    assert.equal(node.selected, String(label === active), label + ' selected state must follow active route');
    return { label, selected: node.selected, bounds: node.bounds, class: node.class };
  });
  proof.screenshots.push(name + '.png');
  proof.checks.push({ name, active, status: 'PASS', tabs });
  console.log(JSON.stringify({ name, active, selected: tabs.filter(t => t.selected === 'true').map(t => t.label), status: 'PASS' }));
}
let exitCode = 1;
try {
  await tapName('Account');
  await swipe(1020, 2290, 2130);
  await tapName('Appearance'); await tapName('Light');
  await swipe(540, 1500, 1740);
  // Approved synthetic captain; exercise every destination and stale-state cleanup.
  for (const name of names) { await tapName(name); await verify(name, 'a2-light-' + name.toLowerCase()); }
  await swipe(1020, 2290, 2130);
  await tapName('Appearance');
  await tapName('Dark');
  await swipe(540, 1500, 1740);
  await verify('Account', 'a2-dark-account');
  await tapName('Rides'); await verify('Rides', 'a2-dark-rides');
  await tapName('Account'); await verify('Account', 'a2-dark-account-return');
  await swipe(1020, 2290, 2130);
  await tapName('Appearance'); await tapName('Light');
  await swipe(540, 1500, 1740);
  await verify('Account', 'a2-final-account');
  proof.status = 'PASS'; exitCode = 0;
} catch (error) {
  proof.status = 'FAIL'; proof.failure = error.message; throw error;
} finally {
  atomicJson(path.join(out, 'P04-A2-native-results.json'), proof);
  const file = path.join(run.directory, 'checks.json');
  atomicJson(file, [...readJson(file, []), { command: 'node tools/ui-quality/p04-a2-device-test.mjs', exitCode, scope: 'Actual native selection, labels, button roles and focusability across all four destinations and Light/Dark; return to Account and Light', at: new Date().toISOString() }]);
}

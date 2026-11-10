// Real native tap/drag regression checks; no production account or API is used.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { physicalDevice } from '../phase9-native/device.mjs';
import { captureNativeHierarchy } from '../../backend/tests/helpers/phase9NativeHierarchy.mjs';
import { readJson, atomicJson, hash } from '../handoff/core.mjs';

const execute = promisify(execFile), state = readJson('output/handoff/state.json');
assert.equal(state.run.phase, 'P04');
const out = path.join(state.run.directory, 'artifacts'), device = await physicalDevice();
const identity = readJson('output/handoff/native-preview-session/native-source-identities.json');
const changed = ['src/pages/Account.tsx', 'src/components/AppBarScrim.tsx', 'src/components/AppBarVisibility.tsx', 'src/components/AppBarTouchGuard.tsx'];
for (const file of changed) assert.equal(hash(fs.readFileSync(path.join(identity.runtimeApp, file))), hash(fs.readFileSync(path.join('driver-app', file))), 'Phone bundle source must match current source: ' + file);
const fixture = readJson('output/handoff/native-fixture.json');
assert(fixture.active && Date.now() - Date.parse(fixture.at) < 15000, 'Fresh isolated fixture required');
assert.match(await device.adb('shell', 'wm', 'size'), /1080x2400/);
assert.match(await device.adb('shell', 'wm', 'density'), /450/);
const proof = { phase: 'P04', issue: 'A1', at: new Date().toISOString(), device: 'SM-A528B Android14 / 1080x2400 / density450', sourceIdentities: changed.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(identity.runtimeApp, file))) })), checks: [], screenshots: [] };
const nodes = xml => [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
const tree = async () => nodes(await captureNativeHierarchy(device));
const has = (list, text) => list.some(n => n['content-desc'] === text || n.text === text || n.label === text);
const bounds = n => (n?.bounds?.match(/-?\d+/g) || []).map(Number);
const pause = () => new Promise(resolve => setTimeout(resolve, 650));
const foreground = async () => assert.match(await device.adb('shell', 'dumpsys', 'activity', 'activities'), /(?:mResumedActivity|topResumedActivity).*com\.rcstravels\.driver\.phase9\//, 'Only operate on the foreground isolated test app');
async function tap(x, y) { await foreground(); await device.adb('shell', 'input', 'tap', String(x), String(y)); await pause(); }
async function swipe(x, from, to) { await foreground(); await device.adb('shell', 'input', 'swipe', String(x), String(from), String(x), String(to), '2000'); await pause(); }
async function back() { await foreground(); await device.adb('shell', 'input', 'keyevent', '4'); await pause(); }
async function tapName(text) {
  const list = await tree();
  const node = list.find(n => n['content-desc'] === text && n.clickable === 'true') || list.find(n => n.text === text);
  assert(node, 'Visible control required: ' + text);
  const [left, top, right, bottom] = bounds(node); assert(bottom > top && right > left, 'Valid visible bounds');
  await tap(Math.round((left + right) / 2), Math.round((top + bottom) / 2));
}
async function capture(name) {
  await execute(process.execPath, ['tools/handoff/p04-audit.mjs', name], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  proof.screenshots.push(name + '.png');
  return readJson(path.join(out, 'P04-evidence', name + '.json')).nodes;
}
function pass(name, details = {}) { proof.checks.push({ name, status: 'PASS', ...details }); console.log(JSON.stringify(proof.checks.at(-1))); }
let exitCode = 1;
try {
  await tapName('Account');
  for (const theme of ['light', 'dark']) {
    let list = await capture('a1-' + theme + '-visible');
    assert(has(list, 'Home') && has(list, 'Appearance'), 'Start at Account top with visible bar');
    const before = bounds(list.find(n => (n.label || '').startsWith('Appearance,')));
    await tap(1020, 2290);
    list = await capture('a1-' + theme + '-covered-tap');
    assert(!has(list, 'Use device setting') && has(list, 'Account'), 'Covered page tap must not open Appearance');
    pass(theme + ': covered gutter tap blocked', { point: [1020, 2290] });
    await tap(1020, 2202);
    list = await tree();
    assert(!has(list, 'Close') && has(list, 'Account'), 'A tap just inside the fade must be blocked');
    await tap(1020, 2190);
    list = await tree();
    assert(has(list, 'Close') && has(list, 'English'), 'A tap immediately above the fade must reach Language');
    await tap(540, 2290);
    list = await tree();
    assert(!has(list, 'Close') && has(list, 'Account'), 'Modal backdrop above the fade must remain tappable');
    pass(theme + ': fade boundary exact; native modal bypasses guard', { blockedY: 2202, allowedY: 2190 });

    await swipe(1020, 2290, 2130);
    list = await capture('a1-' + theme + '-hidden');
    assert(!has(list, 'Home'), 'Drag beginning in fade must hide the bar');
    const row = list.find(n => (n.label || '').startsWith('Appearance,')), rect = bounds(row);
    assert(rect[1] < before[1] - 30, 'Covered-area drag must scroll content');
    const lower = Math.max(rect[1] + 10, 2208), upper = Math.min(rect[3] - 10, 2300);
    assert(upper > lower, 'Appearance must still intersect the former fade strip');
    const y = Math.round((lower + upper) / 2);
    pass(theme + ': drag from covered area scrolls and hides chrome', { before, after: rect });
    await tap(1020, y);
    list = await capture('a1-' + theme + '-hidden-tap');
    assert(has(list, 'Use device setting'), 'Formerly covered content must become tappable');
    pass(theme + ': tap in former fade strip opens Appearance', { point: [1020, y], oldFadeTop: 2197.5 });
    await back();
    await swipe(540, 1500, 1740);
    list = await capture('a1-' + theme + '-restored');
    assert(has(list, 'Home') && has(list, 'Appearance'), 'Upward content scroll must restore bar');
    await tap(1020, 2290);
    list = await tree();
    assert(!has(list, 'Use device setting') && has(list, 'Account'), 'Restored fade must block taps again');
    pass(theme + ': restoring fade restores tap blocking');
    await tap(500, 2120);
    list = await tree(); assert(has(list, 'English') && has(list, 'Close') && !has(list, 'Use device setting'), 'Uncovered Language row must still open');
    await back(); pass(theme + ': uncovered part of settings row remains tappable');

    // Switch theme through the actual menu while the strip is free, restoring Light at end.
    await swipe(1020, 2290, 2130);
    list = await tree();
    const current = bounds(list.find(n => (n['content-desc'] || '').startsWith('Appearance,')));
    await tap(540, Math.round((current[1] + current[3]) / 2));
    await tapName(theme === 'light' ? 'Dark' : 'Light');
    await swipe(540, 1500, 1740);
  }
  await tapName('Home'); let list = await capture('a1-tabs-home');
  assert(has(list, 'No ride scheduled'), 'Tab buttons remain functional through faded strip');
  await tapName('Account'); list = await capture('a1-final-account');
  assert(has(list, 'Appearance') && has(list, 'Home'), 'Return to Account with bar shown');
  assert(list.some(n => n.label === 'Appearance, Light'), 'Original Light preference restored');
  pass('tab buttons still navigate; original Light restored');
  proof.status = 'PASS'; exitCode = 0;
} catch (error) {
  proof.status = 'FAIL'; proof.failure = error.message;
  await capture('a1-failure').catch(() => {}); throw error;
} finally {
  atomicJson(path.join(out, 'P04-A1-native-results.json'), proof);
  const file = path.join(state.run.directory, 'checks.json');
  atomicJson(file, [...readJson(file, []), { command: 'node tools/ui-quality/p04-a1-device-test.mjs', exitCode, scope: 'Actual native light/dark covered taps, scrolling from fade, hidden/reappearing fade, uncovered controls and tab navigation', at: new Date().toISOString() }]);
}

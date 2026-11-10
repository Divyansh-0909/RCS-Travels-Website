import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const exec = args => execFileSync('adb', args, { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
const installed = exec(['shell', 'pm', 'list', 'packages', '--user', '0', 'com.rcstravels.driver.phase9']).includes('package:com.rcstravels.driver.phase9');
const activities = exec(['shell', 'dumpsys', 'activity', 'activities']);
// Never capture or log another application's screen or its activity details.
const foreground = /(?:mResumedActivity|topResumedActivity)[^\n]*com\.rcstravels\.driver\.phase9\//.test(activities);
const proof = { author: 'CODEX', phase: 'P01', at: new Date().toISOString(), maestro: '2.11.0', androidFixtureInstalled: installed, fixtureInForeground: foreground, status: foreground ? 'READY_FOR_ISOLATED_HARNESS_CHECK' : 'BLOCKED', reason: foreground ? 'Validate current synthetic gateway before running supplemental flow' : 'The isolated test application is not in the foreground with a running P01 synthetic gateway/Metro session. Production app was not launched or captured.', flowsExecuted: false, ios: 'BLOCKED: Xcode/iOS simulator unavailable on Windows' };
fs.writeFileSync(path.join(root, 'output/handoff/native-preflight.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));

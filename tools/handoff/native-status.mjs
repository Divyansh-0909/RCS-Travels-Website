import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './core.mjs';

export function nativeStatus(runtime, timestamp = Date.now()) {
  const meta = readJson(path.join(runtime, 'native-screen.json'), {});
  const fixture = readJson(path.join(runtime, 'native-fixture.json'), {});
  const ageMs = timestamp - Date.parse(meta.at), fixtureAge = timestamp - Date.parse(fixture.at);
  const activeFixture = fixture.active === true && fixtureAge >= 0 && fixtureAge < 15000;
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 15000;
  const live = fresh && meta.connected === true && meta.foreground === true && activeFixture &&
    meta.package === 'com.rcstravels.driver.phase9' && fs.existsSync(path.join(runtime, 'native-screen.png'));
  const status = !fresh ? 'STALE / CAPTURE STOPPED' : !meta.connected ? 'DISCONNECTED' :
    !activeFixture ? 'NO ACTIVE FIXTURE' : !meta.foreground ? 'TEST APP NOT FOREGROUND' : live ? 'LIVE' : 'NO FRAME';
  return { live, status, source: meta.source || 'DEVICE', connected: fresh && meta.connected === true,
    foreground: fresh && meta.foreground === true, activeFixture, at: meta.at || null,
    ageMs: Number.isFinite(ageMs) ? ageMs : null, width: meta.width || null, height: meta.height || null,
    package: 'com.rcstravels.driver.phase9', interaction: 'VIEW-ONLY',
    interactionPath: 'Interact directly on the connected physical phone. Browser clicks do not control Android.' };
}

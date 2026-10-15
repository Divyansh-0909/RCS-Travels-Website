import test from 'node:test';
import assert from 'node:assert/strict';
import { phase9UiSourceHashes } from './helpers/phase9UiSources.js';

test('UI receipts bind protected routes, transitive notice ownership and application sources without provider calls', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Source capture cannot contact a provider'); };
  try {
    const sources = await phase9UiSourceHashes(['backend/tests/helpers/phase9UiSources.js']);
    for (const file of ['backend/routes/driver.ts', 'backend/services/driverResponsibilityNotices.js',
      'backend/services/responsibilityIncidentDriver.js', 'backend/middleware/auth.js',
      'backend/routes/responsibilityAdmin.ts', 'frontend/src/pages/VehicleSelect.jsx',
      'backend/tests/helpers/phase9UiSources.js']) assert.match(sources[file], /^[a-f0-9]{64}$/);
  } finally { globalThis.fetch = original; }
});

import { replaySourceHashes } from './phase9ReplayContract.js';
import { phase9ReplayDependencyHashes } from './phase9ReplaySources.js';
import { browserApplicationSources, sourceIdentities } from './phase9BrowserArtifacts.js';

export async function phase9UiSourceHashes(extra) {
  const backend = { ...await replaySourceHashes(), ...await phase9ReplayDependencyHashes([
    'tests/helpers/phase9BrowserHarness.js', 'routes/driver.ts', 'routes/bookings.js', 'routes/users.js',
    'routes/responsibilityAdmin.ts', 'routes/fare.js', 'routes/googleAPI.js',
  ]) };
  return { ...Object.fromEntries(Object.entries(backend).map(([path, hash]) => ['backend/' + path, hash])),
    ...await browserApplicationSources(), ...await sourceIdentities(extra) };
}

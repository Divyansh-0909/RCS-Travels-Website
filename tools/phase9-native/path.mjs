import { win32 } from 'node:path';
import assert from 'node:assert/strict';
export const nativeBuildDestination = run => `C:/r9/${run.slice(0,8)}`;
export function nativeRuntimeDestination(repository,run) {
  const root=win32.parse(repository).root;
  assert.match(root,/^[A-Za-z]:[\\/]$/,'Native runtime requires a local drive');
  assert.match(run,/^[a-f0-9]{8}-/,'Native runtime requires a generated run identity');
  return win32.join(root,'r9',run.slice(0,8));
}

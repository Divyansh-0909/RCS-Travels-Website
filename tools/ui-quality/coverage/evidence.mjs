import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../handoff/config.mjs';
import { Google } from '../../handoff/google.mjs';
import { readJson, atomicJson, hash } from '../../handoff/core.mjs';

const state = readJson(path.join(config.runtime, 'state.json')), google = new Google(config), catalog = readJson(path.join(config.runtime, 'P05-evidence-catalog.json'), {});
const required = {
  P01: ['P01-screen-theme-registry.csv','P01-component-audit.md','P01-ux-flow-audit.md','P01-test-matrix.md','P01-pilot-report.md'],
  P02: ['P02-execution-report.md','P02-test-evidence.md','P02-ux-follow-up.md'],
  P03: ['P03-owner-decision.md','P03-execution-report.md','P03-accessibility-metrics.md'],
  P04: ['P04-execution-report.md','P04-A1-approved-tap-guard.md','P04-A2-approved-selected-state.md'],
};
for (const [phase, names] of Object.entries(required)) {
  const record = state.phases[phase + ':v1'];
  const directory = path.join(config.runtime, 'runs', record.runId);
  const candidates = [...fs.readdirSync(directory).filter(name => /manifest.*\.json$/.test(name)).map(name => path.join(directory, name)), ...fs.readdirSync(path.join(directory, 'artifacts')).filter(name => /manifest.*\.json$/.test(name)).map(name => path.join(directory, 'artifacts', name))];
  const artifacts = candidates.filter(f => fs.existsSync(f)).flatMap(file => readJson(file).artifacts || []);
  for (const name of names) {
    const local = path.join(config.root, 'docs/ui-quality', name), sha256 = hash(fs.readFileSync(local));
    const artifact = artifacts.find(a => a.name === name && a.sha256 === sha256);
    if (!artifact) throw Error('Exact prior report not found in archived manifest: ' + name);
    const verified = await google.verifyArtifact(artifact.id);
    if (verified.sha256 !== sha256) throw Error('Prior Drive evidence mismatch: ' + name);
    catalog[name] = { ...verified, local: 'docs/ui-quality/' + name, phase, readbackVerified: true };
    atomicJson(path.join(config.runtime, 'P05-evidence-catalog.json'), catalog);
  }
}
atomicJson(path.join(config.runtime, 'P05-evidence-catalog.json'), catalog);
console.log(JSON.stringify({ verifiedReports: Object.keys(catalog).length, phases: Object.keys(required) }));

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parse, serialize, validate } from '../coverage/core.mjs';

const out = 'output/handoff/responsibility-redesign-2026-10-29';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const engines = ['chromium', 'firefox', 'webkit'];
const functional = engines.map(engine => read(`${out}/functional-${engine}.json`));
const responsive = engines.map(engine => read(`${out}/responsive-${engine}.json`));
for (const run of functional) {
  assert.equal(run.checks.length, 10);
  assert(run.checks.every(check => check.status === 'PASS'));
  assert.equal(run.errors.length, 0);
}
for (const run of responsive) {
  assert.equal(run.results.length, run.engine === 'chromium' ? 24 : 10);
  assert(run.results.every(check => check.status === 'PASS'));
  assert(run.results.filter(check => check.width < 640).every(check => check.layout.summaryColumns === 1));
  assert.equal(run.errors.length, 0);
}
const states = read(`${out}/states.json`), boundaries = read(`${out}/boundaries.json`), gallery = read(`${out}/shared-field-gallery-checks.json`);
assert.equal(states.checks.length, 4); assert.equal(boundaries.checks.length, 4);
assert.equal(gallery.checks.length, 4); assert.equal(gallery.errors.length, 0);
const axes = fs.readdirSync(out).filter(file => /^axe-(chromium|firefox|webkit|states)-/.test(file));
let axeRuns = 0;
for (const file of axes) {
  const record = read(`${out}/${file}`);
  if (record.violations) { assert.equal(record.violations.length, 0); axeRuns++; }
  else { assert.equal(record.popup.length, 0); assert.equal(record.error.length, 0); axeRuns += 2; }
}
assert.equal(axeRuns, 20);
const logText = file => { const bytes = fs.readFileSync(file); return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''); };
assert(/pass 77/.test(logText(`${out}/frontend-tests.txt`)), 'Frontend test log must report 77 passes');
assert(/built in/.test(logText(`${out}/build-final.txt`)), 'Final build log must report success');
const verification = {
  date: '2026-10-29', status: 'PASS_IN_ISOLATED_BROWSER_SCOPE', cli: { version: '4.23.0', generatedComponents: 12, provenance: 'shadcn-cli-original/provenance.json' },
  unitTests: { pass: 77, responsibilityContractsIncluded: 21 },
  functional: { scenarios: 10, engineExecutions: 30, engines },
  responsive: { configurations: 44, widths: [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920], landscape: '844x390', themes: ['light', 'dark'], text200: [320, 1440] },
  axe: { scopedAudits: axeRuns, observedViolations: 0, incompleteChecksRetained: true },
  keyboardAndErrorConfigurations: states.checks.length, longDataAndForcedColorsConfigurations: boundaries.checks.length,
  galleryRefresh: 4, build: 'PASS; existing large chunk advisory retained',
  live: { light: 'http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=light', dark: 'http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=dark', writes: 'All live preview non-GET API attempts return local 409; no real data or financial action' },
  limits: ['Browser engines and responsive viewports are not physical device certification.', 'Accepted/rejected review writes use browser-only synthetic adapters; no new backend or provider acceptance.', 'No spoken screen-reader, native keyboard or deployed-auth acceptance.', 'Other Item12 field approvals remain pending; shared WebSocket is OWNER_DEFERRED.'],
};
write(`${out}/verification.json`, verification);

// Run once after the final verification/report uploads supply observed Drive URLs.
if (process.argv.includes('--bind-coverage')) {
  const links = read(`${out}/drive-links.json`);
  const csvPath = 'tools/ui-quality/coverage/master-ui-coverage.csv';
  const registeredPath = 'tools/ui-quality/coverage/registered-surfaces.json';
  const rows = parse(fs.readFileSync(csvPath, 'utf8'));
  const original = parse(fs.readFileSync(`${out}/before/tools__ui-quality__coverage__master-ui-coverage.csv`, 'utf8'));
  const bindings = {
    'W.RESPONSIBILITY': 'export default function ResponsibilityCase() {',
    'W.SHARED.RESPONSIBILITY-REVIEW-FORM': 'export default function ResponsibilityReviewForm({ context, api, onReviewed }) {',
    'W.BRANCHES.RESPONSIBILITY-CASE': '{context && (',
    'W.BRANCHES.RESPONSIBILITY-REVIEW-FORM': 'if (!action)',
    'W.STATES.RESPONSIBILITY-CASE': 'const [loading, setLoading] = useState(false);',
    'W.STATES.RESPONSIBILITY-REVIEW-FORM': 'const [busy, setBusy] = useState(false),',
  };
  const registered = read(registeredPath), changed = [];
  for (const [id, token] of Object.entries(bindings)) {
    const row = rows.find(row => row.id === id); assert(row);
    const lines = fs.readFileSync(row.source_file, 'utf8').split(/\r?\n/);
    const matches = lines.flatMap((line, i) => line.includes(token) ? [i + 1] : []); assert.equal(matches.length, 1);
    const update = { id, source_line: matches[0], source_token: token, theme_policy: 'BOTH', theme_basis: 'Owner-authorized Responsibility redesign using RCS semantic light/dark tokens.' };
    if (['W.RESPONSIBILITY', 'W.SHARED.RESPONSIBILITY-REVIEW-FORM'].includes(id)) Object.assign(update, {
      audit_status: 'AUDITED', audit_dimensions: ['render', 'responsive', 'light_dark', 'keyboard', 'validation', 'async_states', 'synthetic_review_and_appeal', 'scoped_axe'],
      owner_decision: 'APPROVED_FOR_FIX', implementation_status: 'VERIFIED', verification_status: 'VERIFIED',
      verification_levels: ['SOURCE_ONLY', 'FIXTURE_RENDER', 'BROWSER_INTERACTION', 'KEYBOARD', 'AXE'],
      last_review_phase: 'OWNER-RESPONSIBILITY-REDESIGN', last_review_date: '2026-10-29',
      evidence_urls: [...new Set([...row.evidence_urls, links.verification, links.report])],
      next_action: 'Owner visual review of the authorized shadcn redesign. Verification is bounded to synthetic browser UI and unchanged contract tests; no backend/production acceptance or unreviewed child closure. See docs/ui-quality/responsibility-redesign-2026-10-29.md.',
    });
    Object.assign(row, update);
    const overlay = registered.updates.find(row => row.id === id);
    if (overlay) Object.assign(overlay, update); else registered.updates.push(update);
    changed.push(id);
  }
  assert.deepEqual(rows.map(row => row.id), original.map(row => row.id));
  for (const row of rows.filter(row => !changed.includes(row.id))) assert.deepEqual(row, original.find(old => old.id === row.id));
  registered.phaseNotes['OWNER-RESPONSIBILITY-REDESIGN'] = 'Owner explicitly authorized whole Responsibility page redesign. Two bounded UI surfaces verified; four grouped state/branch anchors rebound without promoting their audit status. Existing P03/P04/P06/P07 history and shared-WebSocket deferral preserved. ' + links.report;
  fs.writeFileSync(csvPath, serialize(rows)); write(registeredPath, registered);
  const coverage = validate(rows, { issues: read('tools/ui-quality/coverage/issues.json'), routes: read('tools/ui-quality/coverage/discovered-routes.json') });
  write(`${out}/coverage.json`, { ...coverage, sourceAnchorsRebound: changed, boundedSurfaceVerification: ['W.RESPONSIBILITY', 'W.SHARED.RESPONSIBILITY-REVIEW-FORM'], unchangedRows: rows.length - changed.length });
}

const before = read(`${out}/source-before.json`);
const preservation = before.map(record => ({ ...record, after: hash(record.file) }));
const changed = preservation.filter(record => record.sha256 !== record.after).map(record => record.file.replaceAll('\\', '/'));
const allowed = ['frontend/src/pages/ResponsibilityCase.jsx', 'frontend/src/components/ResponsibilityReviewForm.jsx', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/vite.config.js', 'frontend/tsconfig.json', 'tools/ui-quality/consistency/prelude.js', 'tools/ui-quality/coverage/master-ui-coverage.csv', 'tools/ui-quality/coverage/registered-surfaces.json'];
assert(changed.every(file => allowed.includes(file)), 'Unexpected recorded input change');
const gitBefore = read(`${out}/git-before.json`);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const indexPath = execFileSync('git', ['rev-parse', '--git-path', 'index'], { encoding: 'utf8' }).trim();
assert.equal(head, gitBefore.head); assert.equal(hash(indexPath), gitBefore.index);
write(`${out}/preservation.json`, { recordedInputs: before.length, unchanged: before.length - changed.length, allowedChanged: changed, checks: preservation, headAndIndexUnchanged: true });
const files = [];
const collect = folder => { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) { const file = path.join(folder, entry.name); if (entry.isDirectory()) collect(file); else files.push(file); } };
collect('frontend/src/components/responsibility');
files.push('frontend/components.json', 'frontend/src/pages/ResponsibilityCase.jsx', 'frontend/src/components/ResponsibilityReviewForm.jsx', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/vite.config.js', 'frontend/tsconfig.json');
write(`${out}/product-current.json`, files.map(file => ({ file, sha256: hash(file) })));
for (const file of files) {
  const destination = path.join(out, 'source-current', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}
const executors = fs.readdirSync('tools/ui-quality/responsibility').map(file => path.join('tools/ui-quality/responsibility', file));
executors.push('tools/ui-quality/consistency/prelude.js', 'tools/ui-quality/consistency/field-review-check.mjs');
for (const file of executors) {
  const destination = path.join(out, 'executors', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(file, destination);
}
write(`${out}/executor-identities.json`, executors.map(file => ({ file, sha256: hash(file) })));
console.log(JSON.stringify({ workflowExecutions: 30, responsiveConfigurations: 44, axeRuns, recordedInputs: before.length, allowedChanged: changed, newScopedFiles: files.length - 6 }));

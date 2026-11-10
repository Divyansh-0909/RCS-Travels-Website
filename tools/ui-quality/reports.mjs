import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../handoff/config.mjs';
import { atomicJson, readJson, now } from '../handoff/core.mjs';
import { P01_FILES } from '../handoff/engine.mjs';
const root = config.root, runtime = config.runtime;
const state = readJson(path.join(runtime, 'state.json'));
const artifacts = path.join(state.run.directory, 'artifacts');
const docs = path.join(root, 'docs/ui-quality'); fs.mkdirSync(docs, { recursive: true });
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const audit = readJson(path.join(runtime, 'ui/audit/audit.json'));
const links = readJson(path.join(runtime, 'evidence-links.json'), {});
const folder = 'https://drive.google.com/drive/folders/' + config.folderId;
const doc = 'https://docs.google.com/document/d/' + config.documentId + '/edit';
const imageLink = name => links[name]?.url || 'NOT_UPLOADED';
if (Object.values(links).length < 60) throw new Error('Finish uploading the screenshot evidence before generating final reports');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const head = git(['rev-parse', 'HEAD']);
const nativeProof = readJson(path.join(runtime, 'native-verification.json'), null);
const nativePassed = nativeProof?.status === 'PASS';
const nativeSummary = nativeProof ? `${nativeProof.status}: ${nativeProof.scope}${nativeProof.error ? ' — ' + nativeProof.error : ''}${nativeProof.failedAssertion ? ' — failed assertion: ' + nativeProof.failedAssertion : ''}. Evidence: P01-native-verification.json. USB keep-awake remains enabled at the owner’s request.` : 'Native flows have not yet executed; the existing isolated harness is available.';
const prefix = title => `# ${title}\n\nAUTHOR: CODEX\nPHASE: P01\nDATE: 21 October 2026 (Asia/Kolkata)\nEVIDENCE SNAPSHOT: ${now()}\nGIT BASE: ${head}\n\n`;
function write(name, body) { const text = prefix(name.replace(/^P01-|\.md$/g, '')) + body.trim() + '\n'; fs.writeFileSync(path.join(docs, name), text); fs.writeFileSync(path.join(artifacts, name), text); }
const safeEvidence = {
  'live-connection-verification.json': 'P01-connection-verification.json',
  'dispatch-verification.json': 'P01-dispatch-verification.json',
  'codex-smoke-verification.json': 'P01-codex-smoke-verification.json',
  'native-preflight.json': 'P01-native-preflight.json',
  'backend-baseline-timeout.json': 'P01-backend-baseline-timeout.json',
  'ui/before/capture.json': 'P01-before-captures.json',
  'ui/after/capture.json': 'P01-after-captures.json',
  'ui/audit/audit.json': 'P01-audit-captures.json',
  'ui/viewer/views-verification.json': 'P01-viewer-verification.json',
  'phone-awake-verification.json': 'P01-phone-awake-verification.json',
};
if (nativeProof) safeEvidence['native-verification.json'] = 'P01-native-verification.json';
for (const [source, dest] of Object.entries(safeEvidence)) atomicJson(path.join(artifacts, dest), { author: 'CODEX', phase: 'P01', ...readJson(path.join(runtime, source)) });
atomicJson(path.join(artifacts, 'P01-runtime-status.json'), { author: 'CODEX', phase: 'P01', capturedAt: now(), state: state.state, bootstrapOwner: state.bootstrap.threadId, runId: state.run.id, heartbeat: state.heartbeat, lastPoll: state.lastPoll, revision: state.lastProcessedRevision, google: state.connections.google, note: 'Snapshot during bootstrap; final state is in the newest red Doc output and live worker status.' });

const rows = [];
const add = (surface, route, role, purpose, source, currentPolicy, intendedPolicy, notes = '') => rows.push({ surface, route, role, purpose, source, entry: surface === 'web' ? 'router / direct URL' : 'native router / authenticated navigation', exit: surface === 'web' ? 'existing links / browser back' : 'existing AppBar / device back', majorStates: 'loading / empty / error / success where implemented; not all states exercised', backendDependencies: /Settings|Safety/.test(source) ? 'authenticated user preferences / saved places / emergency contact' : /Tracking|Vehicle|Booking|Ride|HomeGate/.test(source) ? 'booking/fare/maps/dispatch; see the exact executed fixture scope' : /Admin|Responsibility/.test(source) ? 'admin/role-specific backend; no production activity' : 'inspect source; no production data used', viewports: surface === 'web' ? 'registry includes 360/390/768/1280/1440; see matrix for executed cells' : 'One Android failure capture at 1080x2400; other per-screen/theme/device checks NOT RUN', currentPolicy, intendedPolicy, evidence: source.includes('ThemeContext') ? 'shared provider inspected' : 'code inspection + matching P01 audit/native capture if present', notes });
const main = read('frontend/src/main.jsx');
const imports = new Map([...main.matchAll(/(?:const|import)\s+(\w+)\s*(?:=\s*lazy\(\(\)\s*=>\s*import\(|from\s*)['"]([^'"]+)/g)].map(m => [m[1], 'frontend/src/' + m[2].replace(/^\.\//, '') + (path.extname(m[2]) ? '' : '.jsx')]));
for (const match of main.matchAll(/path:\s*"([^"]+)"/g)) {
  const route = match[1];
  const slice = main.slice(match.index, main.indexOf('},', match.index) + 2);
  const component = [...slice.matchAll(/<([A-Z]\w*)/g)].map(m => m[1]).find(c => c !== 'ProtectedRoute') || 'DevPreview';
  const legacy = ['/', '/outstation', '/book', '/booking/:id', '/t/:token'].includes(route);
  const actual = audit.captures.filter(c => c.route === route);
  const policy = legacy ? 'INTENTIONALLY_DARK_ONLY' : actual.some(c => c.actualTheme === 'light') && actual.some(c => c.actualTheme === 'dark') ? 'BOTH_SUPPORTED' : 'UNKNOWN_REQUIRES_REVIEW';
  add('web', route, slice.includes('requireAdmin') ? 'admin' : slice.includes('ProtectedRoute') ? 'rider (authenticated)' : 'public / fixture only if /dev', component, imports.get(component) || 'frontend/src/pages/DevPreview.jsx', policy, legacy ? 'INTENTIONALLY_DARK_ONLY' : 'BOTH_SUPPORTED (shared provider; page overrides still require confirmation)', legacy ? 'Fixed legacy composition, including intentional alternating light/dark sections; does not follow the account theme preference. Home and Outstation are independent.' : actual.length ? 'Representative captures exist; not approved goldens or complete functional coverage.' : 'NOT RUN on this exact route; development fixture coverage is separate.');
}
for (const m of read('frontend/src/constants/legal.js').matchAll(/^\s*"(\/[\w-]+)":\s*\{/gm)) if (!rows.some(r => r.surface === 'web' && r.route === m[1])) add('web', m[1], 'public', 'Legal draft document', 'frontend/src/pages/LegalPage.jsx', audit.captures.some(c => c.route === m[1]) ? 'BOTH_SUPPORTED' : 'UNKNOWN_REQUIRES_REVIEW', 'BOTH_SUPPORTED (shared provider)', 'Draft legal content is preserved; this audit does not approve legal accuracy.');
const previews = read('frontend/src/pages/DevPreview.jsx');
for (const m of previews.matchAll(/\["(\/dev[^\"]*)",\s*"([^\"]+)"\]/g)) add('web', m[1], 'developer fixture', m[2], 'frontend/src/pages/DevPreview.jsx', 'BOTH_SUPPORTED (fixture provider)', 'BOTH_SUPPORTED (fixture only)', 'Synthetic fixture; a light fixture does not authorize a light redesign of the corresponding legacy production page.');
for (const view of ['states', 'cancellation', 'trip']) if (!rows.some(r => r.route === '/dev/' + view)) add('web', '/dev/' + view, 'developer fixture', view, 'frontend/src/pages/DevPreview.jsx', 'BOTH_SUPPORTED (fixture provider)', 'BOTH_SUPPORTED (fixture only)', 'Documented/reachable fixture; test details are in the matrix.');
const native = read('driver-app/src/main.tsx');
const nativeRoutes = new Set();
for (const m of native.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<([A-Z]\w*)/g)) {
  const route = '/' + m[1]; if (nativeRoutes.has(route)) continue; nativeRoutes.add(route);
  const candidate = fs.readdirSync(path.join(root, 'driver-app/src/pages')).find(f => f.replace(/\.(tsx|jsx)$/, '') === m[2]);
  add('native', route, /login|signup|welcome/.test(route) ? 'captain (auth/onboarding)' : 'captain (gate varies by route)', m[2], candidate ? 'driver-app/src/pages/' + candidate : 'driver-app/src/main.tsx', 'UNKNOWN_REQUIRES_REVIEW', 'UNKNOWN_REQUIRES_REVIEW', 'Shared ThemeProvider supports system/light/dark. Native appearance, gestures/maps/keyboards not executed in P01. Redirects and verification gates preserved.');
}
for (const screen of ['Home', 'ActiveRide', 'Standby', 'OnboardingStatus', 'OnBoarding']) add('native', '/ (HomeGate/auth variant: ' + screen + ')', 'captain (state/verification dependent)', screen, `driver-app/src/pages/${screen}.${screen === 'OnBoarding' ? 'jsx' : 'tsx'}`, 'UNKNOWN_REQUIRES_REVIEW', 'UNKNOWN_REQUIRES_REVIEW', 'State-selected screen, not an invented route. Native verification is pending.');
for (const row of rows) {
  if (!fs.existsSync(path.join(root, row.source))) {
    const stem = row.source.replace(/\.jsx$/, '');
    row.source = [stem + '.tsx', stem + '.js', stem + '.ts', stem + '/index.jsx', stem + '/index.tsx'].find(file => fs.existsSync(path.join(root, file))) || row.source;
  }
  row.author = 'CODEX'; row.phase = 'P01';
  for (const field of ['currentPolicy', 'intendedPolicy']) {
    const detail = row[field];
    row[field] = detail.match(/^(BOTH_SUPPORTED|LIGHT_ONLY_CURRENT|DARK_ONLY_CURRENT|INTENTIONALLY_LIGHT_ONLY|INTENTIONALLY_DARK_ONLY|UNKNOWN_REQUIRES_REVIEW)/)?.[1] || 'UNKNOWN_REQUIRES_REVIEW';
    if (detail !== row[field]) row.notes += ' ' + detail;
  }
}
const columns = Object.keys(rows[0]);
const csv = columns.join(',') + '\n' + rows.map(r => columns.map(k => '"' + String(r[k]).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
for (const base of [docs, artifacts]) fs.writeFileSync(path.join(base, 'P01-screen-theme-registry.csv'), csv);

const defects = audit.captures.filter(c => c.violations?.length).map(c => `| ${c.screen} | ${c.route} | ${c.width} / ${c.preference} (${c.actualTheme}) | ${c.violations.map(v => v.id).join(', ')} | [capture](${imageLink('P01-audit-' + c.screenshot)}) |`).join('\n');
const allImages = Object.entries(links).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => `- [${name}](${item.url}) — SHA-256 ${item.sha256}`).join('\n');
const matrix = rows.filter(r => r.surface === 'web').flatMap(r => [360,390,768,1280,1440].flatMap(width => ['light','dark'].map(theme => {
  const pilot = r.route === '/dev/settings';
  const capture = audit.captures.find(c => c.route === r.route.split('?')[0] && c.width === width && c.preference === theme);
  const status = pilot ? 'PASS: notifications + theme + loading/error functional checks' : capture ? `${capture.status}; axe ${capture.violations ? (capture.violations.length ? 'FAIL' : 'no reported violations') : 'NOT RUN'}; functional journey NOT RUN` : 'NOT RUN';
  return `| ${r.route} | ${theme} | ${width} | ${status} |`;
}))).join('\n');

write('P01-connection-setup-report.md', `The automatic local handoff is implemented and running. Google Drive/Docs API reads, a red status insertion, preservation of existing green text, upload/readback/delete, the change feed, a real Codex CLI turn, and a real fixture-dispatch/restart test were verified. This report is published before releasing P01 bootstrap ownership; final review readiness is recorded in the newest red Doc output.

Architecture: one Node 24 worker in tools/handoff, one repository lock, atomic durable JSON state, 60-second Drive change/revision reconciliation, and supported Codex CLI 0.160.1 JSON events. Existing ChatGPT authentication is used; no Codex SDK, app-server daemon, paid API fallback, cloud worker or duplicate ChatGPT automation was introduced. App-server capabilities and CLI resume help were inspected; CLI was the simpler supported interface. The chat Drive connector read the authoritative document first; background access uses the installed Google CLI after the owner's completed Drive consent. Credentials stay in their existing OS profiles.

Connections: Drive CONNECTED (correct folder and canAddChildren); Docs CONNECTED (correct document/revision and formatting readback); Codex CONNECTED (ChatGPT login, turn.completed and thread ID saved). The existing hourly ChatGPT reviewer was preserved, not independently reconfigured or instant-triggered. Its next successful review remains external to this local worker.

Configuration is ignored output/handoff/config.json; machine state, checkpoints, per-run prompts, last successful tests, manifests and heartbeat are under output/handoff. Application .env files were not edited; credentials were not printed, copied or uploaded. The dedicated fixture preview loads no .env files. Worker network/status listeners bind only to loopback. Optional startup is available but was not installed.

Packages: the worker needs no npm packages. Frontend developer tooling added Storybook 10.6.3 (react-vite, a11y, docs), @axe-core/playwright 4.14.0 and Chromatic 18.13.0; existing Playwright 1.64.0 and Maestro 2.11.0 were reused. Production application behavior changed only through accessible-name props on the existing switch family.

Commands from repository root:

\`\`\`powershell
.\\tools\\handoff\\handoff.ps1 start
.\\tools\\handoff\\handoff.ps1 status
.\\tools\\handoff\\handoff.ps1 stop
.\\tools\\handoff\\handoff.ps1 restart
.\\tools\\handoff\\handoff.ps1 resume
node tools/handoff/cli.mjs probe
node tools/ui-quality/serve.mjs
\`\`\`

Viewer http://127.0.0.1:4317/ ; safe actual frontend http://127.0.0.1:1575/ ; Storybook http://127.0.0.1:6006/ . Bootstrap was registered to this existing session, then the worker was stopped/restarted multiple times without dispatching another P01 task. The phase becomes idle AWAITING_REVIEW only after manifest/artifact verification and red OUTPUT_READY publication. Next prompts must follow the plain ready header/version convention in tools/handoff/README.md; no signature or extra approval is required. Product and production-action approval boundaries remain in force.

Known limits: CLI tasks are not promised to appear in this already-open desktop conversation; laptop power/network and the worker are required. Exact intra-turn replay is not supported by this integration; resume uses the saved thread/checkpoint. Unknown quota resets use 6/12/24-hour retries then manual resume. Real quota exhaustion was not induced; recovery was simulated. Native verification: ${nativeSummary} Chromatic cloud publishing remains unexecuted without a project token. [Authoritative handoff](${doc}); [workspace](${folder}).`);

write('P01-automation-verification.md', `| Requirement | Evidence / result | Type |
|---|---|---|
| Drive/Docs authenticated access | Correct IDs, folder write capability, document and change feed verified | REAL |
| Correct active prompt | P01:v1 parsed, both addenda included; formatting/report writes leave hash stable | REAL + FIXTURE |
| Newly ready prompt | P99 synthetic document drove a real Codex turn in a separate Git fixture | REAL dispatcher; simulated Drive event |
| Exactly one launch | P99 actualCodexLaunches=1, saved thread ID and completed turn | REAL |
| Duplicate events | Repeated P99 events and reloaded Engine did not dispatch again | REAL persisted dispatcher + fixture source |
| Crash/restart state | Worker stop/start retained P01 owner, phase/run/thread and heartbeat; unit fixtures cover interrupted/publication states | REAL restart + SIMULATED failures |
| Author colors | Added range read back dark red; original green text unchanged | REAL Google Docs |
| Artifact upload | Test uploaded/read back/hash verified, then deleted; final screenshots uploaded and read back | REAL Google Drive |
| Incomplete phase never done | Missing artifact/failing evidence rejected; manifest required before OUTPUT_READY | AUTOMATED FIXTURE |
| Usage exhaustion | Limit pauses, persists thread/checkpoint, suppresses calls and resumes same phase | SIMULATED; no real quota exhaustion induced |
| Heartbeat/current work | Durable five-second heartbeat and live current issue/status | REAL |
| Live website/status | Desktop + phone viewer captures; interactive actual frontend iframe; Storybook switch interaction and axe in both themes | REAL browser |
| Bootstrap duplicate prevention | P01 remains owned by this current session through infrastructure/pilot; no watcher P01 dispatch | REAL state + automated guard tests |
| Existing review discovery | Exact P01 report names, screenshot folder, artifact manifest and latest red OUTPUT_READY block | REAL publication; future hourly review not forced |

Commands: npm --prefix tools/handoff test — 21 tests: 20 passed, 1 skipped (Windows file-symlink privilege unavailable), exit 0. node tools/handoff/verify-live.mjs — exit 0. node tools/handoff/verify-codex.mjs — one real connection smoke, exit 0. node tools/handoff/verify-dispatch.mjs — one real dispatcher fixture run, exit 0. node tools/ui-quality/verify-views.mjs — exit 0.

Evidence JSON files in this handoff: P01-connection-verification.json, P01-dispatch-verification.json, P01-codex-smoke-verification.json, P01-runtime-status.json and P01-viewer-verification.json. Fixture Drive publication is explicitly distinguished from the real Google API color/upload checks. Temporary connection-test artifacts were removed. No test prompt was inserted into the shared human prompt history. Original P01 prompts and green formatting remain intact. Native/device follow-up: ${nativeSummary}`);

write('P01-live-viewer-instructions.md', `Open http://127.0.0.1:4317/ . The left pane is the real frontend with hot reload; the right pane shows current screen, issue, action, status, verified fixes, heartbeat and connection/usage pauses. Follow current screen is the default. Page selection keeps Home/Landing and Outstation independent. Width choices include 360, 390, 768, 1280 and 1440px; the left pane scrolls for wide previews.

Start worker: .\\tools\\handoff\\handoff.ps1 start . Start safe frontend in another terminal: node tools/ui-quality/serve.mjs . Direct frontend URL: http://127.0.0.1:1575/ . Settings fixture: http://127.0.0.1:1575/dev/settings . Select Theme in the actual application to choose System/Light/Dark. Marketing and booking routes keep their fixed legacy policy; no missing theme is invented. On phone, the existing section menu switches between navigation and content.

The dedicated fixture server serves the actual app, existing synthetic Clerk transport and local in-memory preference APIs without loading .env. It disables unsupported mutations. It proves frontend behavior, not real backend persistence or real payments/dispatch. The existing normal Vite server at 1574 was left running and reused only as an observed environment fact; P01 tests used 1575.

Storybook: npm --prefix frontend run storybook ; http://127.0.0.1:6006/ . View the existing control stories in light/dark. Accessibility addon is manual to avoid simultaneous axe runs; the Playwright checks execute axe automatically. Watch browser tests with npm --prefix frontend run test:ui -- --headed --workers=1 . Native screens require the isolated Android harness described in tools/ui-quality/maestro/README.md; no native visual fidelity is claimed.

Worker status/stop/restart/resume: .\\tools\\handoff\\handoff.ps1 status|stop|restart|resume (run one action per command). Optional sign-in startup: startup-install; remove it with startup-remove. Startup was not enabled automatically. Laptop must remain powered, connected and able to access this repository. Servers are loopback-only.

P01 progress actually transitioned Investigating → Editing → Testing → Fixed, with timestamps persisted before/after meaningful changes. FIXED — VERIFIED was set only after 30 browser checks, axe, the frontend build and 68 existing frontend tests passed. [Desktop viewer](${imageLink('P01-live-viewer-1920.png')}); [phone viewer](${imageLink('P01-live-viewer-390.png')}).`);

write('P01-execution-report.md', `P01 completed its infrastructure setup, route/theme registry, representative audit and one conservative accessibility pilot. Automatic local handoff is operational; the latest red Doc output and artifact manifest are the review entrypoint. This does not approve an app-wide redesign or certify all booking/native journeys.

Baseline checkpoint: codex/p01-ui-handoff-20261021 points to ${head}. The pre-existing working tree was dirty across backend, website, captain app and proofloop files; those changes were preserved. No commit, reset, stash, production deployment or business-rule change was performed. Exact pilot rollback copies are ignored under output/handoff/pilot-rollback.

| Tool | Installed/configured | Executed now | Limitation |
|---|---|---|---|
| Playwright 1.64.0 | Reused; 5 widths × 2 themes | 30 pilot checks PASS; ${audit.captures.length} wider captures | Critical backend rider/driver/admin journeys are not approved by frontend fixtures |
| Storybook 10.6.3 | React/Vite; real ThemeProvider, MemoryRouter and existing primitives | Production build PASS; switch stories interact/axe PASS in both themes | Dialog/navigation story expansion remains follow-up |
| axe-core / @axe-core/playwright 4.14.0 | Storybook + browser | Pilot zero violations after fix; wider findings recorded | Human assistive-tech checks still needed |
| Chromatic 18.13.0 | Configured; autoAcceptChanges=false | NOT RUN | No project token in environment; no signup, upload, paid run or baseline approval attempted |
| Maestro 2.11.0 | Existing isolated native harness reused; supplemental flow/preflight | ${nativePassed ? 'Bounded REAL native journey PASS' : nativeProof ? 'Runner attempted; native verification FAILED' : 'Tool/device/package discovery only'} | ${nativeSummary} iOS is not available on Windows; full native theme/keyboard/map coverage remains unapproved. |

Validation: frontend build exit 0; frontend unit/regression tests 68/68 exit 0; pilot Playwright 30/30 exit 0; Storybook build exit 0; Storybook switch/axe and viewer checks exit 0; handoff tests 20 pass/1 skip/0 fail exit 0. Baseline driver-app lint exit 0 with 7 existing warnings. Baseline backend typecheck exit 1: pre-existing untracked StudyAI/services/index_langGraph.ts:127 returns Promise<string|undefined> incompatible with the LangGraph node type. Baseline backend tests were stopped after 651 seconds, stalled in already-modified phase9dCustodyClosureTransport.test.js; 665 reported passes before timeout, no completed-suite verdict. No unrelated backend business-logic fix was attempted.

Native test infrastructure follow-up: Docker Desktop was started, the phone was woken and confirmed unlocked, and USB keep-awake was left enabled. The first isolated attempt hit Undici’s five-minute HeadersTimeoutError while Metro was building its cold bundle. The test-only bundle preflight now uses loopback HTTP with the intended overall ten-minute deadline and a 100 MB response bound; health probes also have a five-second timeout. Four focused response/deadline tests and fourteen existing native infrastructure/transport tests passed. The retry built the 22,589,747-byte bundle (HTTP 200), launched the separate test app and restored the synthetic captain session. Maestro tapped Accept, received the controlled HTTP 503, then failed to observe the expected retry message; later acceptance/cancellation assertions did not execute. The captured device showed “No ride scheduled”. This is an outstanding finding, not a native pass or a reason to change booking behavior without review. [Actual native failure capture](${imageLink('P01-native-controlled-acceptance-failure.png')}).

The pilot adds translated accessible names to Toggle and its Settings/Safety callers. All three notification switches originally failed axe button-name in both themes at 390/1440px; those four captures now report zero violations. The layout is intentionally preserved. Tests cover keyboard Space, tab/focus outline, request payload, reload persistence against isolated fixtures, disabled loading, rollback after a failed update, real theme selection/persistence and overflow at all five widths.

Theme architecture already exists: shared/theme/tokens.cjs → generated CSS, ThemeProvider → ThemeRouteSync, with semantic surface/ink/border/strong roles and intentionally fixed legacy compositions. No new provider or palette was introduced. Home/Landing and Outstation are distinct routes and compositions. Their legacy mode includes light sections; it does not mean every pixel is dark. The CSV records ${rows.length} route/screen/variant entries, preserves unknown native policies and separates fixture appearances from production intent.

Broader defects: Home/Outstation contrast findings; Home target-size findings; light booking-fixture contrast; dark legal text contrast; Safety default-contact accessibility findings. Exact axe targets and screenshots are in P01-audit-captures.json and the component audit. Manual inspection also found the 390px Home full-page image is 420px wide despite the simple document overflow probe returning false; transformed descendant overflow needs investigation before accepting that baseline. No marketing identity or legal/product rules were changed.

Live viewer and handoff details: P01-live-viewer-instructions.md, P01-connection-setup-report.md and P01-automation-verification.md. Pending owner decisions: NONE for this bounded pilot. Further marketing redesigns, booking/dispatch/payment changes, intentionally single-theme changes or paid cloud activity still require the existing approvals. ChatGPT should inspect these actual artifacts before choosing a correction or next phase; Codex did not author P02.`);

write('P01-component-audit.md', `The controlled family is frontend/src/components/ui/Toggle.jsx, reused by notification and live-location settings. Verified defect: switches had aria-checked and keyboard-native button semantics but no accessible name. The pilot forwards aria-label/aria-labelledby and supplies the existing translated visible labels. Appearance, callback and disabled contracts are unchanged.

Existing reusable primitives include Button, Input, SettingRow, AccountLayout, CircleIconButton, EmptyState, FailureState, Skeleton and feedback overlays. Storybook uses these production components directly, not story-only clones. Existing semantic tokens remain the theming foundation; no token change was required to correct a name.

Legitimate variation: RideOptions OptionRow is the whole interactive switch, with a decorative SliderToggle inside it. Its booking-specific price/context and legacy treatment differ from account Toggle. Do not replace it with a nested interactive Toggle or homogenize their appearance. Account SettingRow and marketing information cards serve different composition roles. Home and Outstation remain independent.

Follow-up candidates: ThemeToggle uses radio roles and Enter/Space, but arrow-key/roving-tab behavior still needs assessment; no full radio-group keyboard conformance is claimed. AccountLayout navigation includes clickable heading/icon elements that warrant a keyboard/semantics audit. Saved-place icon controls and emergency-contact form labels need the exact axe findings investigated before broader primitive changes. Existing button outer/inner layout and form association must be preserved if consolidated.

Observed automated findings outside the pilot (repro: run node tools/ui-quality/serve.mjs, select the listed route/theme/width, run axe; screenshots are unapproved evidence):

| Screen | Route | Width / preference (actual theme) | axe findings | Evidence |
|---|---|---|---|---|
${defects}

Severity: inaccessible unnamed pilot controls were critical per axe and are fixed. Remaining contrast findings require measured color/target investigation, preserving intentional legacy sections. Home touch targets and 420px capture width need a bounded responsive fix proposal. Exact CSS causes outside the pilot are not yet proven; these are findings, not approved redesign instructions.`);

write('P01-ux-flow-audit.md', `Rider entrypoints: Home hero/navbar lead toward the existing city booking flow; repeated entrypoints can be useful on a long page and are not automatically duplicate features. Outstation explicitly sells a different day-priced, return-inclusive service arranged by phone/WhatsApp. Its separate route, content and contact flow must remain intact; do not fabricate online outstation dispatch to make the UI look complete.

Booking → vehicle selection → tracking, scheduled/ride-now payment and cancellation remain backed by their existing contracts. P01 inspected synthetic preview states only and did not create bookings, send notifications, accept rides, process payments or mutate customer data. Critical rider/backend journeys are NOT RUN in this phase. Existing backend suite timeout and typecheck failures are separate from a browser fixture pass.

Settings: actual notification switches now expose their visible translated names. Keyboard operation, loading disablement, failed-save rollback and safe fixture reload persistence passed. Mobile AccountLayout intentionally shows either the section list or content, while desktop shows both; this difference is retained. API/database persistence is not proven by the fixture. Saved-place editing/removal and safety sharing behavior were preserved and require broader authenticated fixture coverage.

Captain: native routes and state-specific HomeGate variants are listed in the registry. Existing verified/assigned-work gates intentionally differ for new work and already assigned rides; they must not be flattened by a visual cleanup. Native verification: ${nativeSummary} No app-wide device visual approval is claimed. Admin: a synthetic dashboard preview was captured; authorization, finance actions and dispute review were not executed. Future work must reuse isolated real-backend and native harnesses rather than add production auth bypasses.

Priorities: keyboard/accessible names and concise error feedback first; then contrast/target size and role-specific journey tests; only then review larger information-architecture changes with the owner. No new feature, deleted workflow or product-policy decision was introduced.`);

write('P01-visual-baselines.md', `These captures are diagnostic baselines, NOT approved goldens. Do not auto-accept or overwrite reviewed snapshots. Website rendering used the dedicated local synthetic preview with external network blocked. A separate actual Android failure capture is included from the isolated native app. No app-wide native map, safe-area, gesture or keyboard fidelity is certified, and no customer data is included.

Metadata: P01-before-captures.json and P01-after-captures.json contain the Settings Notifications baseline/after pairs at 390 and 1440px in light/dark; P01-audit-captures.json indexes ${audit.captures.length} broader 390/1440 captures, actual data-theme, errors, axe targets and the basic overflow probe; P01-viewer-verification.json records interactive viewer/Storybook checks. The pilot has no intended pixel redesign; accessibility names improve screen-reader output while preserving the reviewed composition.

Manually inspected representative Settings light-phone/dark-desktop, Home phone, Outstation desktop and viewer images. Remaining captures are programmatic evidence and still require human visual review. Home phone full-page capture width exceeds the requested viewport (420 vs 390); this is a known issue, not an approved baseline. Light /dev booking fixtures are not proof that their legacy production routes support light mode.

Uploaded screenshot index:

${allImages}`);

write('P01-test-matrix.md', `Passing controlled pilot: 3 meaningful tests × 5 widths × 2 themes = 30. The tests verify notification keyboard/focus/request/reload behavior + axe/responsiveness, loading/error rollback, and real theme selection/persistence. Before/after capture pairs separately cover 390/1440px. Storybook switch interaction and axe ran in both themes. Frontend build and 68 existing tests passed. No screenshot alone is treated as functional verification.

Baseline/backend/native/cloud limitations are documented in P01-execution-report.md. Native verification: ${nativeSummary} Unlisted native routes, per-screen light/dark policies, maps/gestures/keyboards and iOS remain NOT RUN; Android preflight alone is not a flow pass. Unlisted real backend booking/payment/dispatch/admin-action journeys remain NOT RUN. Chromatic cloud is NOT RUN without its project token.

Every website registry route/variant is included below. CAPTURED_NOT_APPROVED only proves rendering/capture, with the stated axe result; it is not a journey pass. Unknown/missing cells remain NOT RUN. Legacy routes ignore a light account preference by design.

| Route / variant | Preference | Width | Verdict |
|---|---|---|---|
${matrix}`);

write('P01-pilot-report.md', `Pilot family: existing Toggle. Representative screen: Settings → Notifications. Supporting caller: Safety → Live location. Scope: translated accessible names only; no layout, styling, data, API, booking, payment, dispatch or cancellation changes.

Functional contract: role=switch, aria-checked reflects the existing state, type=button, keyboard Space/Enter activates the native button, disabled prevents interaction, existing onClick callback/API payload and failed-save rollback remain intact. The new optional aria-label/aria-labelledby props supply names without replacing those contracts. Settings names use the same translation function as visible labels; Safety uses its visible translated live-location label.

Before: axe button-name affected all three notification switches in light/dark at 390/1440. After: zero violations in the four corresponding captures, zero page errors, all 30 pilot browser tests pass across 360/390/768/1280/1440 and both themes. Frontend build exit 0; existing frontend regressions 68/68 exit 0. Storybook existing switch stories render/interact/axe clean in light/dark. Browser persistence uses local synthetic preferences and proves the frontend request/reload contract, not production DB behavior. Native work is a separate verification scope: ${nativeSummary}

Actual status transitions were persisted: Investigating (unnamed-switch repro), Editing (translated label forwarding), Testing (keyboard/theme/error/axe/build/regressions), Fixed (only after checks passed). Viewer proof includes current screen/action and live heartbeat. Aesthetic layout was intentionally preserved; the measurable improvement is accessible control identification.

Before: [light phone](${imageLink('P01-before-settings-notifications-light-390.png')}), [dark desktop](${imageLink('P01-before-settings-notifications-dark-1440.png')}). After: [light phone](${imageLink('P01-after-settings-notifications-light-390.png')}), [dark desktop](${imageLink('P01-after-settings-notifications-dark-1440.png')}). All other pairs and metadata are in the visual-baseline index.

Rollback: restore only the three pilot files from output/handoff/pilot-rollback/frontend/src/... after reviewing any newer edits. The baseline Git reference is codex/p01-ui-handoff-20261021; do not reset/stash the dirty repository or overwrite unrelated work. The pilot stops here. Wider axe/visual findings and native/cloud readiness remain follow-up work with the original approval boundaries.`);

write('P01-rollout-plan.md', `1. Reviewer inspects P01 reports, JSON evidence, actual screenshots and the red output manifest. Accept, request a targeted correction, or obtain an owner decision. Codex has not authored a next numbered prompt.
2. Bounded web accessibility batch: measure the reported marketing/legal contrast and Home target-size/descendant overflow issues. Preserve fixed legacy compositions and Home/Outstation separation. Minor measured token fixes may proceed within the existing conservative scope; visual-identity or information-architecture changes require owner approval.
3. Extend real-component Storybook coverage to dialogs/navigation, empty/error/loading feedback and keyboard states. Keep one real provider and protected visual baselines. Connect Chromatic only after the owner supplies the appropriate project/token; do not auto-accept changes or initiate paid cloud work.
4. Reuse the isolated real-backend fixture harness for rider/driver/admin journeys and expand the test matrix beyond representative captures. Resolve the pre-existing custody test hang and unrelated StudyAI typecheck issue in their own authorized workstreams, preserving current dirty changes.
5. Expand or repair the existing isolated native backend/Metro/device harness according to P01-native-verification.json, then extend Maestro launch/navigation/auth/theme/form flows. Keep Android package identity/hash checks and synthetic data; use a Mac/iOS simulator for iOS. Obtain real device screenshots before approving maps, safe areas, gestures or keyboards.

Proposed common theming direction: continue semantic canvas/surface/elevated/ink/border/action/status roles in shared/theme/tokens.cjs, regenerate CSS through the theme script, and retain page-specific/legacy treatments. No additional provider or blind palette inversion is proposed. Missing counterparts require verified intent; unknown native policies remain unknown until observed.

Production actions, core business rules, paid runs, major redesigns, merged/removed screens and intentional single-theme changes remain approval-gated under the original P01. No new handoff authorization process is introduced.`);

for (const name of P01_FILES) if (!fs.existsSync(path.join(artifacts, name))) throw new Error('Missing deliverable ' + name);
const logBuffer = fs.readFileSync(path.join(runtime, 'handoff-tests.log'));
const handoffLog = logBuffer.toString(logBuffer[0] === 255 && logBuffer[1] === 254 ? 'utf16le' : 'utf8');
if (!/fail 0/.test(handoffLog)) throw new Error('Handoff test evidence does not show zero failures');
const tests = [
  { command: 'npm --prefix tools/handoff test', exitCode: 0, scope: '20 passed / 1 Windows symlink-privilege skip / 0 failed' },
  { command: 'node tools/handoff/verify-live.mjs', exitCode: 0, scope: 'Real Google auth/read/write/color preservation/upload/readback/delete' },
  { command: 'node tools/handoff/verify-dispatch.mjs', exitCode: 0, scope: 'Synthetic ready event; one real Codex turn; duplicate/reload suppression in isolated Git fixture' },
  { command: 'npm --prefix frontend run build', exitCode: 0, scope: 'Changed website build' },
  { command: 'npm --prefix frontend test', exitCode: 0, scope: '68 existing frontend tests' },
  { command: 'npm --prefix frontend run test:ui', exitCode: 0, scope: '30 pilot tests, 5 widths and 2 themes' },
  { command: 'npm --prefix frontend run storybook:build', exitCode: 0, scope: 'Real component Storybook static build' },
  { command: 'node tools/ui-quality/verify-views.mjs', exitCode: 0, scope: 'Interactive viewer at desktop/phone; Storybook switch keyboard + axe in both themes' },
  { command: 'node --test tools/ui-quality/tests/bundle-preflight.test.mjs', exitCode: 0, scope: '4/4 native bundle deadline/response integrity checks' },
  { command: 'node --import tsx --test tests/phase9NativeInfrastructure.test.js tests/phase9NativeTransport.test.js', exitCode: 0, scope: '14/14 existing native isolation/transport checks (backend working directory)' },
];
if (nativePassed) tests.push({ command: 'node backend/tests/run-phase9-native.js --keep-awake', exitCode: 0, scope: nativeProof.scope });
atomicJson(path.join(state.run.directory, 'result.json'), { status: 'complete', summary: `P01 connection infrastructure and local automation activated; registry/audit completed and one accessible-name pilot verified. Frontend pilot: 30/30 browser checks, 68/68 existing tests, build and Storybook/axe passed. Native startup/session restoration succeeded, but the controlled-503 retry-message assertion FAILED on the real phone; this is not a native journey pass. Native bundle/infrastructure checks passed 4/4 and 14/14. Chromatic cloud is not connected. Pre-existing backend typecheck failure and baseline test timeout remain disclosed. No mass redesign or product/business changes. USB keep-awake is enabled.`, verified: true, tests, baselineTests: [{ command: 'npm --prefix backend run typecheck', exitCode: 1, preExisting: true }, { command: 'npm --prefix backend test', status: 'TIMED_OUT', elapsedSeconds: 651, partialPass: 665, complete: false }, { command: 'npm --prefix driver-app run lint', exitCode: 0, warnings: 7 }, { command: 'node backend/tests/run-phase9-native.js --keep-awake', exitCode: nativePassed ? 0 : 1, scope: nativeSummary }], artifacts: fs.readdirSync(artifacts).filter(f => /\.(md|csv|json|png)$/.test(f)), requiredArtifacts: P01_FILES });
console.log(JSON.stringify({ reports: P01_FILES.length, registryRows: rows.length, captures: audit.captures.length, images: Object.keys(links).length, artifacts: fs.readdirSync(artifacts).length, runId: state.run.id }));

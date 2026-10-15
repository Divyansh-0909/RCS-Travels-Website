import test from 'node:test'
import assert from 'node:assert/strict'
import { sealPhase9Scenario, validatePhase9Scenario, verifyPhase9Freeze, V5_HASH, digest } from './helpers/phase9ReplayContract.js'
import { createPhase9CanonicalMap, canonicalPhase9State, registerPhase9Actors } from './helpers/phase9ReplayCanonical.js'
import { installPhase9ControlledTime, installPhase9DatabaseTime } from './helpers/phase9ControlledTime.js'
import { createTestClock } from './helpers/testClock.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { phase9ReplayDependencyHashes } from './helpers/phase9ReplaySources.js'
import { spawnSync } from 'node:child_process'
import { createResponsibilityEvidence } from '../services/responsibilityEvidence.js'
import { responsibilityEvidenceHash } from '../services/responsibilityAnalyst.js'
import { jevV5AnalysisEnvelope } from '../services/responsibilityJevV5.js'
import { normalizeEvidenceAware } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { evidenceCriteriaV5Questions } from '../benchmarks/responsibility/evidenceCriteriaV5.js'
import { responsibilityShadowLogicalKey } from '../services/responsibilityShadowConfig.js'

const recipe = { id: 'contract', initial: { at: '2026-10-09T06:00:00Z', fare: 1000 },
  events: [{ sequence: 1, type: 'capture', at: '2026-10-09T06:01:00Z' }] }
const reseal = value => { const { integrity: _old, ...body } = value; return { ...body, integrity: digest(body) } }

test('replay hashes transitive local sources, actual TypeScript resolution and data while rejecting paths outside the backend', async () => {
  const files = { 'root.js': "import './dep.js'; export { value } from './dep.ts'; import './data.json'",
    'dep.ts': 'export const value = 1', 'data.json': JSON.stringify({ literal: "import './not-code.js'" }) }
  const sourceReads = []
  const read = async url => {
    const file = url.pathname.split('/').at(-1)
    sourceReads.push(file)
    if (!(file in files)) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return Buffer.from(files[file])
  }
  const result = await phase9ReplayDependencyHashes(['root.js', 'root.js'], { read })
  assert.deepEqual(Object.keys(result), ['data.json', 'dep.ts', 'root.js'])
  assert.equal(sourceReads.filter(file => file === 'root.js').length, 1, 'cached roots are read once')
  assert.ok(Object.values(result).every(value => /^[a-f0-9]{64}$/.test(value)))
  for (const code of ["export { value } from  './dep.ts'", "import  ('./dep.ts')", "import(  './dep.ts')",
    "import\n('./dep.ts')", "import(\n'./dep.ts')", "import  './dep.ts'"]) {
    files['root.js'] = code
    assert.deepEqual(Object.keys(await phase9ReplayDependencyHashes(['root.js'], { read })), ['dep.ts', 'root.js'])
  }
  for (const extension of ['cjs', 'mjs']) {
    files[`root.${extension}`] = "import './dep.ts'"
    assert.deepEqual(Object.keys(await phase9ReplayDependencyHashes([`root.${extension}`], { read })), ['dep.ts', `root.${extension}`])
  }
  for (const path of ['../outside.js', '/absolute.js', 'nested/../../outside.js']) {
    await assert.rejects(phase9ReplayDependencyHashes([path], { read }), /OUTSIDE_BACKEND/)
  }
  files['root.js'] = "import '../outside.js'"
  await assert.rejects(phase9ReplayDependencyHashes(['root.js'], { read }), /OUTSIDE_BACKEND/)
  await assert.rejects(phase9ReplayDependencyHashes(['root.js', 'unreadable.json'], { read: async url => {
    if (url.pathname.endsWith('unreadable.json')) throw new Error('later unrelated read failed')
    return read(url)
  } }), /OUTSIDE_BACKEND/, 'an escaping dependency must fail before a later root can mask its error')
  files['root.js'] = "import './dep.js'"; files['dep.ts'] = "import './dep.js'"
  assert.deepEqual(Object.keys(await phase9ReplayDependencyHashes(['root.js'], { read })), ['dep.ts', 'root.js'],
    'a JavaScript import resolving to a cyclic TypeScript file terminates at its physical identity')
  await assert.rejects(phase9ReplayDependencyHashes(['missing.json'], { read }), /missing/)
  await assert.rejects(phase9ReplayDependencyHashes(['root.js'], { read: async () => { throw new Error('read failure') } }), /read failure/)
  const attempts = []
  const unavailable = async url => {
    attempts.push(url.pathname.split('/').at(-1))
    throw Object.assign(new Error('denied'), { code: 'EACCES' })
  }
  await assert.rejects(phase9ReplayDependencyHashes(['root.js'], { read: unavailable }), /denied/)
  assert.deepEqual(attempts, ['root.js'], 'a permission error must not select another source')
  attempts.length = 0
  await assert.rejects(phase9ReplayDependencyHashes(['missing.json'], { read: async url => {
    attempts.push(url.pathname.split('/').at(-1)); throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  } }), /missing/)
  assert.deepEqual(attempts, ['missing.json'], 'only JavaScript imports have a TypeScript fallback')
})

test('replay contract binds exact sources, frozen identity, provider fixtures, initial configuration and ordered inputs', async () => {
  const valid = await sealPhase9Scenario(recipe)
  assert.equal(valid.schema, 'rcs-phase9-scenario-v1')
  assert.equal(await validatePhase9Scenario(valid), valid)
  assert.ok(Object.keys(valid.sources).some(key => key.endsWith('/migration.sql')))
  for (const file of ['services/payments.js', 'services/customerLifecycleIncidents.js', 'services/driverAssignment.js',
    'tests/helpers/phase9ReplayExecutor.js', 'tests/helpers/phase9ReplayCanonical.js', 'tests/helpers/phase9ReplaySources.js',
    'tests/fixtures/postgis-pgvector.Dockerfile', 'prisma/schema.prisma', 'package.json', 'package-lock.json']) {
    assert.match(valid.sources[file], /^[a-f0-9]{64}$/, `actual runtime source binding: ${file}`)
  }
  for (const mutate of [value => { value.schema = 'other' }, value => { value.frozenV5 = 'wrong' },
    value => { value.integrity = 'wrong' }]) {
    const copy = structuredClone(valid); mutate(copy)
    await assert.rejects(validatePhase9Scenario(copy), /INTEGRITY/)
  }
  for (const mutate of [value => { value.schema = 'other' }, value => { value.frozenV5 = 'wrong' }]) {
    const copy = structuredClone(valid); mutate(copy)
    await assert.rejects(validatePhase9Scenario(reseal(copy)), /INTEGRITY/)
  }
  const eventTypes = ['capture', 'offer', 'accept', 'driver_cancel', 'customer_cancel', 'recovery', 'ride', 'cash',
    'refund', 'refund_callback', 'payment_failed', 'gps', 'route', 'online', 'notification', 'delivery',
    'capacity', 'commitment', 'confirmation_fault', 'checkpoint', 'shadow', 'forbid', 'final_capture',
    'provider_fault', 'foreign_hold', 'snapshot', 'stale_cancel', 'stale_ride', 'race', 'restart', 'refund_ack', 'redispatch']
  const everyEvent = await sealPhase9Scenario({ ...recipe, events: eventTypes.map((type, index) => ({
    type, sequence: index + 1, at: recipe.events[0].at })) })
  assert.equal(await validatePhase9Scenario(everyEvent), everyEvent)
  const maxEvents = await sealPhase9Scenario({ ...recipe, events: Array.from({ length: 100 }, (_, index) => ({
    ...recipe.events[0], sequence: index + 1 })) })
  assert.equal(await validatePhase9Scenario(maxEvents), maxEvents)
  const sources = structuredClone(valid); sources.sources['services/payments.js'] = 'wrong'
  await assert.rejects(validatePhase9Scenario(reseal(sources)), /SOURCE_IDENTITY/)
  const providers = structuredClone(valid); providers.providerFixtures.routing = 'wrong'
  await assert.rejects(validatePhase9Scenario(reseal(providers)), /PROVIDER_IDENTITY/)
  for (const mutate of [value => { value.events = null }, value => { value.events = [] },
    value => { value.events = Array(101).fill(valid.events[0]) }, value => { value.initial.at = 'invalid' },
    value => { value.initial.fare = null }, value => { value.initial.fare = 0 }]) {
    const copy = structuredClone(valid); mutate(copy)
    await assert.rejects(validatePhase9Scenario(reseal(copy)), /INVALID_INITIAL_STATE/)
  }
  for (const mutate of [value => { value.events[0].sequence = 2 }, value => { value.events[0].type = 'unknown' },
    value => { value.events[0].at = 'bad' }, value => { value.events[0].at = '2026-10-09T05:00:00Z' }]) {
    const copy = structuredClone(valid); mutate(copy)
    await assert.rejects(validatePhase9Scenario(reseal(copy)), /INVALID_EVENT_SEQUENCE/)
  }
})

test('freeze verification rejects changed configuration or any bound source without modifying the frozen files', () => {
  const root = process.env.RCS_PHASE9_REPOSITORY_ROOT ?? fileURLToPath(new URL('../../', import.meta.url))
  const manifest = JSON.parse(readFileSync(resolve(root, 'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json')))
  assert.equal(manifest.freezeHash, V5_HASH)
  const hashes = Object.fromEntries(manifest.sourceManifest.map(row => [row.file.replace(/^backend\//, ''), row.sha256]))
  verifyPhase9Freeze(manifest, hashes)
  assert.throws(() => verifyPhase9Freeze({ ...manifest, freezeHash: 'other' }, {}), /CONFIG_MISMATCH/)
  assert.throws(() => verifyPhase9Freeze(manifest, {}), /SOURCE_MISMATCH/)
  assert.throws(() => verifyPhase9Freeze({ ...manifest, status: 'CHANGED' }, hashes), /CONFIG_MISMATCH/)
})

test('actual replay source loading validates the default root, frozen manifest and bound source bytes through virtual failure reads', () => {
  const child = spawnSync(process.execPath, ['--import', './tests/helpers/phase9UnitIsolation.js', '--import', 'tsx',
    '--experimental-test-module-mocks', fileURLToPath(new URL('./helpers/phase9ReplaySourceProbe.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: process.env, timeout: 20_000,
    windowsHide: true, encoding: 'utf8',
  })
  assert.equal(child.status, 0, `source loader integrity probe: ${child.error?.code ?? child.stderr}`)
})

test('canonical identities are explicit, injective, type checked and preserve all non-identity values', () => {
  const map = createPhase9CanonicalMap()
  map.register(null, '@absent'); map.register(undefined, '@absent')
  assert.throws(() => map.register(10, '@number'))
  map.register('actual-driver-identity', '@driver')
  map.register('actual-driver-identity', '@driver')
  assert.throws(() => map.register('actual-driver-identity', '@other'))
  assert.throws(() => map.register('another-id', '@driver'), /canonical identity collision/)
  assert.deepEqual(map.normalize({ id: 'actual-driver-identity', eventKey: 'prefix:actual-driver-identity', amount: 10,
    nested: [null, false, 'literal', new Date('2026-10-09T06:00:00Z')] }), {
    id: '@driver', eventKey: 'prefix:@driver', amount: 10,
    nested: [null, false, 'literal', '2026-10-09T06:00:00.000Z'],
  })
  assert.deepEqual(map.manifest(), { 'actual-driver-identity': '@driver' })
  map.register('2026', '@booking.otp')
  assert.equal(map.normalize('2026'), '@booking.otp')
  assert.equal(map.normalize('2026-10-09T06:00:00.000Z'), '2026-10-09T06:00:00.000Z')
  assert.equal(map.normalize('opaque-provider-value-2026'), 'opaque-provider-value-2026')
  map.register('a'.repeat(15), '@short'); map.register('b'.repeat(16), '@compound')
  assert.equal(map.normalize('prefix:' + 'a'.repeat(15)), 'prefix:' + 'a'.repeat(15))
  assert.equal(map.normalize('prefix:' + 'b'.repeat(16)), 'prefix:@compound')
  const ledger = createPhase9CanonicalMap()
  ledger.register('recovery-identity-long', '@recovery:earning-identity-long')
  ledger.register('earning-identity-long', '@earning:owner-identity-long')
  ledger.register('owner-identity-long', '@owner')
  assert.equal(ledger.normalize('recovery-identity-long'), '@recovery:@earning:@owner')
  map.register('prefix-identity-long', '@short-prefix')
  map.register('prefix-identity-long-extension', '@long-prefix')
  assert.equal(map.normalize('event:prefix-identity-long-extension'), 'event:@long-prefix')
})

test('cyclic canonical mappings terminate with an integrity error in a bounded isolated process', () => {
  const child = spawnSync(process.execPath, ['--import', './tests/helpers/phase9UnitIsolation.js', '--import', 'tsx',
    fileURLToPath(new URL('./helpers/phase9CanonicalCycleProbe.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: process.env, timeout: 10_000,
    windowsHide: true, encoding: 'utf8',
  })
  assert.equal(child.status, 0, `cyclic normalization must terminate: ${child.error?.code ?? child.stderr}`)
})

test('actor canonicalization registers every synthetic identity and keeps roles and booking fixtures distinct', () => {
  const fields = ['id', 'clerkId', 'phone', 'bookingCode', 'vehicleNumber', 'payoutUpiId']
  const actor = role => Object.fromEntries(fields.map(field => [field, `${role}-identity-${field}`]))
  const actors = { id: 'scenario', customer: actor('customer'), drivers: ['rcs', 'partner'].map(group => ({ ...actor(group),
    group, activeVehicleId: `${group}-vehicle-identity` })), bookingStates: { previous: { id: 'previous', reference: 'ref-previous' },
    future: { id: 'future', reference: 'ref-future' } } }
  const map = createPhase9CanonicalMap()
  registerPhase9Actors(map, actors)
  const expected = { scenario: '@scenario' }
  for (const field of fields) expected[actors.customer[field]] = `@customer.${field}`
  for (const driver of actors.drivers) {
    for (const field of fields) expected[driver[field]] = `@driver.${driver.group}.${field}`
    expected[driver.activeVehicleId] = `@vehicle.${driver.group}`
  }
  for (const [role, row] of Object.entries(actors.bookingStates)) {
    expected[row.id] = `@fixture.booking.${role}`; expected[row.reference] = `@fixture.reference.${role}`
  }
  assert.deepEqual(map.manifest(), expected)
})

test('canonical replay retains records without generated IDs and refuses unknown identities', () => {
  const state = { booking: { id: 'booking-identity-for-replay', reference: null, otp: null, shareToken: null }, cases: [],
    authorities: { final: [], liabilities: [], compensation: [] },
    financial: { payments: [], wallets: [], drivers: [] }, offers: [], incidents: [], routes: [], evidence: [], work: [],
    shadowResults: [], analystCalls: [], webhooks: [], allocations: [], liabilityEntries: [],
    notifications: [{ id: 'notice', providerMessageId: null, purpose: 'offer', attemptedAt: new Date('2026-10-09T06:00:00Z') }],
    observations: [{ value: 'second' }, { value: 'first' }] }
  const result = canonicalPhase9State(createPhase9CanonicalMap(), state)
  assert.equal(result.notifications[0].id, '@notification.offer.2026-10-09T06:00:00.000Z')
  assert.deepEqual(result.observations, [{ value: 'first' }, { value: 'second' }])
  assert.throws(() => canonicalPhase9State(createPhase9CanonicalMap(), { ...state,
    unknownIdentity: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), /unregistered random identity/)
  const evidence = createResponsibilityEvidence({ caseId: 'case', caseType: 'DRIVER_CANCELLATION', bookingId: state.booking.id,
    clock: createTestClock('2026-10-09T06:00:00Z') }).snapshot()
  const evidenceHash = responsibilityEvidenceHash(evidence)
  const response = { model: 'jev-1.13.0', answers: Object.fromEntries(Object.keys(evidenceCriteriaV5Questions())
    .map(key => [key, { choice: 'NO', confidence: 0.97 }])) }
  response.answers.responsibility.choice = 'DRIVER_CAUSED'
  const analysisId = jevV5AnalysisEnvelope(evidence, normalizeEvidenceAware(response, evidence)).analysisId
  const witnessed = { ...state, cases: [{ id: 'case', evidenceSnapshot: evidence, evidenceHash }],
    evidence: [{ id: 'version', caseId: 'case', evidenceHash }],
    work: [{ id: 'work', caseId: 'case', evidenceVersionId: 'version',
      logicalKey: responsibilityShadowLogicalKey({ caseId: 'case', evidenceHash }) }],
    shadowResults: [{ id: 'shadow', caseId: 'case', analysisProviderId: analysisId }],
    analystCalls: [{ caseId: 'case', response }] }
  const canonical = canonicalPhase9State(createPhase9CanonicalMap(), witnessed)
  assert.equal(canonical.cases[0].id, 'case', 'a live case must not become the preexisting human fixture')
  assert.equal(canonical.evidence[0].id, '@evidence.case')
  assert.equal(canonical.work[0].id, '@work.case')
  assert.equal(canonical.shadowResults[0].id, '@shadow.case')
  assert.equal(canonical.cases[0].evidenceHash, responsibilityEvidenceHash(canonical.cases[0].evidenceSnapshot))
  assert.equal(canonical.shadowResults[0].analysisProviderId, jevV5AnalysisEnvelope(canonical.cases[0].evidenceSnapshot,
    normalizeEvidenceAware(response, canonical.cases[0].evidenceSnapshot)).analysisId)
  assert.equal(canonical.work[0].logicalKey, responsibilityShadowLogicalKey({ caseId: 'case', evidenceHash: canonical.cases[0].evidenceHash }))
  for (const change of [value => { value.cases[0].evidenceHash = 'wrong' },
    value => { value.work[0].logicalKey = 'wrong' }, value => { value.shadowResults[0].analysisProviderId = 'wrong' },
    value => { value.work[0].evidenceVersionId = 'unknown' }, value => { value.shadowResults[0].caseId = 'unknown' },
    value => { value.analystCalls[0].caseId = 'unknown' }, value => {
      value.shadowResults[0].caseId = 'unknown'; value.analystCalls[0].caseId = 'unknown'
    }]) {
    const corrupted = structuredClone(witnessed); change(corrupted)
    assert.throws(() => canonicalPhase9State(createPhase9CanonicalMap(), corrupted))
  }
  for (const literal of ['a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-a']) {
    assert.equal(canonicalPhase9State(createPhase9CanonicalMap(), { ...state, literal }).literal, literal)
  }
  const humanFixture = { ...state, cases: [{ id: 'prior-case', evidenceVersion: 'test-v1', evidenceHash: 'test-hash', state: 'FINAL_UPHELD' }] }
  canonicalPhase9State(createPhase9CanonicalMap(), humanFixture)
  for (const fields of [{ evidenceHash: 'wrong' }, { state: 'NEEDS_ADMIN_REVIEW' }]) {
    assert.throws(() => canonicalPhase9State(createPhase9CanonicalMap(), { ...humanFixture,
      cases: [{ ...humanFixture.cases[0], ...fields }] }))
  }
})

test('canonical replay maps every financial, authority, dispatch and provider record while preserving content and order', () => {
  let next = 0
  const id = () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`
  const driverId = id(), map = createPhase9CanonicalMap()
  map.register(driverId, '@driver')
  const state = { booking: { id: id(), reference: id(), otp: '1234', shareToken: id() },
    cases: [{ id: id(), evidenceVersion: 'test-v1', evidenceHash: 'test-hash', state: 'FINAL_UPHELD' }],
    authorities: Object.fromEntries(['final', 'liabilities', 'compensation'].map(key => [key, [{ id: id(), amount: 31 }]])),
    financial: { payments: ['scheduled_ride_final', 'scheduled_ride_advance'].map(purpose => ({ id: id(), purpose, amount: 17 })),
      wallets: ['zeta', 'alpha'].map(eventKey => ({ id: id(), eventKey, amount: 23 })),
      drivers: [{ id: driverId, balance: 29 }] },
    offers: [{ id: id(), driverId }], incidents: [{ id: id(), driverId }],
    routes: [{ id: id(), bookingId: null, event: 'pickup', calculatedAt: new Date('2026-10-09T06:00:00Z') }],
    notifications: [{ id: id(), providerMessageId: 'provider-message', purpose: 'offer' }],
    webhooks: [{ id: id(), eventId: 'provider-event' }], allocations: [{ id: id(), bookingId: null }],
    liabilityEntries: [{ id: id(), eventKey: 'recovery' }], evidence: [], work: [], shadowResults: [], analystCalls: [] }
  const result = canonicalPhase9State(map, state)
  assert.deepEqual(result.financial.wallets, [{ id: '@wallet.alpha', eventKey: 'alpha', amount: 23 },
    { id: '@wallet.zeta', eventKey: 'zeta', amount: 23 }])
  assert.deepEqual(result.financial.payments.map(row => row.id), ['@payment.scheduled_ride_advance', '@payment.scheduled_ride_final'])
  assert.deepEqual(result.financial.drivers, [{ id: '@driver', balance: 29 }])
  for (const [key, name] of [['final', 'final'], ['liabilities', 'liability'], ['compensation', 'compensation']]) {
    assert.deepEqual(result.authorities[key], [{ id: `@preexisting.${name}`, amount: 31 }])
  }
  assert.equal(result.offers[0].id, '@offer.@driver')
  assert.equal(result.incidents[0].id, '@cancellation.@driver')
  assert.equal(result.routes[0].id, '@route.null.pickup.2026-10-09T06:00:00.000Z')
  assert.equal(result.notifications[0].id, '@notification.provider-message')
  assert.equal(result.webhooks[0].id, '@webhook.provider-event')
  assert.equal(result.allocations[0].id, '@allocation.null')
  assert.equal(result.liabilityEntries[0].id, '@liability-entry.recovery')
  assert.equal(result.booking.otp, '@booking.otp')
  assert.equal(result.booking.id, '@booking')
  assert.equal(result.booking.reference, '@booking.reference')
  assert.equal(result.booking.shareToken, '@booking.shareToken')
  assert.equal(result.cases[0].id, '@preexisting.case')
})

test('controlled clock is confined to explicitly isolated sequential lifecycles and restores native behavior', () => {
  const saved = process.env.PHASE9_ISOLATED, native = Date
  const clock = createTestClock('2026-10-09T06:00:00Z')
  try {
    process.env.PHASE9_ISOLATED = '0'
    assert.throws(() => installPhase9ControlledTime(clock))
    process.env.PHASE9_ISOLATED = '1'
    const restore = installPhase9ControlledTime(clock)
    try {
      assert.equal(Date.now(), clock.now().getTime())
      assert.equal(new Date().toISOString(), '2026-10-09T06:00:00.000Z')
      assert.equal(new Date('2026-10-08T06:00:00Z').toISOString(), '2026-10-08T06:00:00.000Z')
      assert.equal(Date(), new native(clock.now().getTime()).toString())
      assert.equal(new Date() instanceof Date, true)
      assert.equal(Date.parse('2026-10-09T06:00:00Z'), clock.now().getTime())
      assert.equal(Date.UTC(2026, 9, 9, 6), clock.now().getTime())
      assert.throws(() => installPhase9ControlledTime(clock), /controlled lifecycles must run sequentially/)
    } finally { restore() }
    assert.equal(Date, native)
  } finally { if (saved === undefined) delete process.env.PHASE9_ISOLATED; else process.env.PHASE9_ISOLATED = saved }
})

test('database clock validates owned identity and table identifiers before installing test-only audit triggers', async () => {
  const clock = createTestClock('2026-10-09T06:00:00Z'), writes = [], reads = []
  const fake = { $queryRaw: async template => { const query = template.join(''); reads.push(query); return query.includes('current_database')
    ? [{ name: `rcs_verify_${'a'.repeat(32)}` }] : [{ table_name: 'bookings' }] },
  $executeRaw: async (...args) => { writes.push(args); return 1 },
  $executeRawUnsafe: async query => { writes.push(query); return 1 } }
  const sync = await installPhase9DatabaseTime(fake, clock)
  assert.equal(await sync(), 1)
  clock.advance(1000)
  assert.equal(await sync(), 1)
  assert.deepEqual(writes.filter(Array.isArray).map(row => row[1].toISOString()),
    ['2026-10-09T06:00:00.000Z', '2026-10-09T06:00:00.000Z', '2026-10-09T06:00:01.000Z'])
  assert.ok(writes.some(value => typeof value === 'string' && value.includes('BEFORE INSERT OR UPDATE ON "bookings"')))
  const sql = writes.map(value => typeof value === 'string' ? value : value[0].join('?')).join('\n')
  for (const fragment of ['CREATE TABLE phase9_clock', 'CREATE FUNCTION phase9_audit_clock()', 'SELECT instant INTO STRICT stamp',
    "TG_OP = 'INSERT'", "jsonb_build_object('created_at', stamp)", "jsonb_build_object('updated_at', stamp)",
    'NEW := jsonb_populate_record(NEW, patch); RETURN NEW;', 'INSERT INTO phase9_clock VALUES (true, ?)',
    'UPDATE phase9_clock SET instant = ? WHERE id', 'FOR EACH ROW EXECUTE FUNCTION phase9_audit_clock()']) assert.ok(sql.includes(fragment), fragment)
  assert.match(reads[1], /table_schema = 'public'[\s\S]*'created_at', 'updated_at'[\s\S]*NOT LIKE '_prisma%'/)
  assert.doesNotMatch(sql, /observed_at|received_at|captured_at/)
  await assert.rejects(installPhase9DatabaseTime({ ...fake, $queryRaw: async () => [{ name: 'production' }] }, clock))
  for (const name of [`prefix_rcs_verify_${'a'.repeat(32)}`, `rcs_verify_${'a'.repeat(32)}_suffix`]) {
    const before = writes.length
    await assert.rejects(installPhase9DatabaseTime({ ...fake, $queryRaw: async template => template.join('').includes('current_database')
      ? [{ name }] : [] }, clock))
    assert.equal(writes.length, before, 'a foreign namespace must be rejected before any clock write')
  }
  await assert.rejects(installPhase9DatabaseTime({ ...fake, $queryRaw: async template => template.join('').includes('current_database')
    ? [{ name: `rcs_verify_${'a'.repeat(32)}` }] : [{ table_name: 'unsafe;name' }] }, clock))
})

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableSerializeResponsibilityEvidence } from '../../services/responsibilityEvidence.js'
import { phase9ReplayDependencyHashes } from './phase9ReplaySources.js'

export const REPLAY_SCHEMA = 'rcs-phase9-scenario-v1'
export const V5_HASH = 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75'
export const REPLAY_SOURCES = [
  'services/bookingCreation.js', 'services/scheduledPayments.js', 'services/payments.js', 'services/razorpayWebhook.js',
  'routes/payments.js', 'services/driverAssignment.js', 'services/driverDelay.js', 'services/googleRoutes.js',
  'services/driverLocationUpdate.js', 'services/rideGeofence.ts', 'services/cancellationLocationEvidence.js',
  'services/driverDispatchCandidates.js', 'services/driverDispatchOffers.js',
  'services/ridePooling.js',
  'services/customerLifecycleIncidents.js', 'services/lifecycleIncidentEvidence.js', 'services/driverCancellations.js',
  'services/driverRideCancellation.js', 'services/scheduledDepositLifecycle.js', 'services/scheduledReservationHandoff.js',
  'services/customerCancellation.js', 'services/scheduledOffers.js', 'services/assignScheduledRides.js',
  'services/rideSettlement.js', 'services/commission.js', 'services/wallet.js', 'services/walletKeys.js',
  'services/notificationProvenance.js', 'services/routeProvenance.js', 'services/responsibilityShadowRepository.js',
  'services/responsibilityShadowAdjudication.js', 'services/refundProviderState.js', 'services/ridePayments.ts',
  'services/responsibilityShadowConfig.js', 'services/cancellationPolicy.js', 'constants/dispatch.js',
  'tests/helpers/phase9Isolation.js', 'tests/helpers/phase9Lifecycle.js', 'tests/helpers/razorpayFake.js',
  'tests/helpers/phase9ReplayContract.js', 'tests/helpers/phase9ReplayCanonical.js',
  'tests/helpers/phase9ReplayExecutor.js', 'tests/helpers/phase9ReplayEvents.js',
  'tests/helpers/phase9ReplayDeviceEvents.js', 'tests/helpers/phase9ControlledTime.js',
  'tests/helpers/phase9ReplayRaces.js', 'prisma/schema.prisma',
  'tests/helpers/compensationFixture.js',
  'tests/helpers/phase9ReplayScenarios.js',
  'tests/helpers/phase9FinancialJourneys.js', 'tests/helpers/financialInvariants.js',
  'tests/helpers/postgisEnvironment.js', 'tests/helpers/postgisPrerequisites.js', 'tests/run-phase9.js',
  'tests/fixtures/postgis-pgvector.Dockerfile',
  'data/shady-zones.geojson', 'data/zones.geojson',
  'package.json', 'package-lock.json',
]
export const digest = value => createHash('sha256').update(stableSerializeResponsibilityEvidence(value)).digest('hex')
export function verifyPhase9Freeze(manifest, hashes) {
  const { freezeHash, ...body } = manifest
  const bodyHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  if (freezeHash !== V5_HASH || bodyHash !== V5_HASH) throw new Error('FROZEN_V5_CONFIG_MISMATCH')
  for (const source of manifest.sourceManifest) {
    if (hashes[source.file.replace(/^backend\//, '')] !== source.sha256) throw new Error('FROZEN_V5_SOURCE_MISMATCH')
  }
}
export async function replaySourceHashes() {
  const root = process.env.RCS_PHASE9_REPOSITORY_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url))
  const manifest = JSON.parse(await readFile(resolve(root, 'output/responsibility-v5-freeze-2026-10-08/freeze-manifest.json')))
  const folders = await readdir(new URL('../../prisma/migrations/', import.meta.url), { withFileTypes: true })
  const migrations = folders.filter(row => row.isDirectory()).map(row => `prisma/migrations/${row.name}/migration.sql`).sort()
  const sources = [...new Set([...REPLAY_SOURCES, ...migrations,
    ...manifest.sourceManifest.map(row => row.file.replace(/^backend\//, ''))])]
  const hashes = await phase9ReplayDependencyHashes(sources)
  verifyPhase9Freeze(manifest, hashes)
  return hashes
}

export async function sealPhase9Scenario(recipe) {
  const payload = { schema: REPLAY_SCHEMA, frozenV5: V5_HASH, sources: await loadedSourceHashes,
    providerFixtures: { payments: 'razorpay-fake-v1', routing: 'google-routes-json-v1', notifications: 'offline-provenance-v1' },
    ...structuredClone(recipe) }
  return { ...payload, integrity: digest(payload) }
}

// The loaded process keeps its original identity. Later edits must fail validation,
// even when a newly sealed case would otherwise bind old loaded code to new bytes.
const loadedSourceHashes = replaySourceHashes()

export async function validatePhase9Scenario(scenario) {
  const { integrity, ...payload } = scenario
  if (scenario.schema !== REPLAY_SCHEMA || scenario.frozenV5 !== V5_HASH || digest(payload) !== integrity) {
    throw new Error('REPLAY_INPUT_INTEGRITY_MISMATCH')
  }
  if (digest(scenario.sources) !== digest(await replaySourceHashes())) throw new Error('REPLAY_SOURCE_IDENTITY_MISMATCH')
  if (digest(scenario.providerFixtures) !== digest({ payments: 'razorpay-fake-v1', routing: 'google-routes-json-v1',
    notifications: 'offline-provenance-v1' })) throw new Error('REPLAY_PROVIDER_IDENTITY_MISMATCH')
  if (!Array.isArray(scenario.events) || !scenario.events.length || scenario.events.length > 100
    || !Number.isFinite(Date.parse(scenario.initial.at)) || !Number.isFinite(scenario.initial.fare)
    || scenario.initial.fare <= 0) throw new Error('REPLAY_INVALID_INITIAL_STATE')
  const allowed = ['capture', 'offer', 'accept', 'driver_cancel', 'customer_cancel', 'recovery', 'ride', 'cash',
    'refund', 'refund_callback', 'payment_failed', 'gps', 'route', 'online', 'notification', 'delivery',
    'capacity', 'commitment', 'confirmation_fault', 'checkpoint', 'shadow', 'forbid', 'final_capture',
    'provider_fault', 'foreign_hold', 'snapshot', 'stale_cancel', 'stale_ride', 'race', 'restart', 'refund_ack', 'redispatch']
  let previous = Date.parse(scenario.initial.at)
  for (const [index, event] of scenario.events.entries()) {
    const timestamp = Date.parse(event.at)
    if (event.sequence !== index + 1 || !allowed.includes(event.type) || !Number.isFinite(timestamp)
      || timestamp < previous) throw new Error('REPLAY_INVALID_EVENT_SEQUENCE')
    previous = timestamp
  }
  return scenario
}

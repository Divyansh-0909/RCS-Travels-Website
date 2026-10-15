import assert from 'node:assert/strict'
import { createTestDatabase } from './database.js'
import { createTestClock } from './testClock.js'
import { installPhase9ControlledTime, installPhase9DatabaseTime } from './phase9ControlledTime.js'
import { createPhase9Lifecycle } from './phase9Lifecycle.js'
import { financialState, assertJourneyWallets } from './phase9FinancialJourneys.js'
import { createPhase9RouteProvider } from './phase9ReplayDeviceEvents.js'
import { executePhase9Event } from './phase9ReplayEvents.js'
import { validatePhase9Scenario, digest } from './phase9ReplayContract.js'
import { createPhase9CanonicalMap, registerPhase9Actors, canonicalPhase9State } from './phase9ReplayCanonical.js'
import { seedEntitlement } from './compensationFixture.js'

async function stateForReplay(s) {
  const [state, routes, notifications, locations, work, webhooks, bookings, authorities] = await Promise.all([
    financialState(s), s.db.routeObservation.findMany(), s.db.notificationDelivery.findMany(),
    s.db.driverLocation.findMany(), s.db.responsibilityAdjudicationWork.findMany(), s.db.razorpayWebhookEvent.findMany(),
    s.db.booking.findMany(), Promise.all([s.db.responsibilityFinalDecision.findMany(), s.db.responsibilityLiability.findMany(),
      s.db.responsibilityCompensation.findMany()]),
  ])
  return { ...state, routes, notifications, locations, work, webhooks, bookings,
    authorities: { final: authorities[0], liabilities: authorities[1], compensation: authorities[2] },
    providerHistory: s.provider.history, routeProviderHistory: s.navigation.history, analystCalls: s.calls }
}

export async function executePhase9Scenario(scenario) {
  await validatePhase9Scenario(scenario)
  const database = await createTestDatabase()
  const clock = createTestClock(scenario.initial.at)
  const restoreTime = installPhase9ControlledTime(clock)
  let s
  try {
    const syncDatabaseTime = await installPhase9DatabaseTime(database.client, clock)
    const beforeBooking = async ({ db, actors }) => {
      if (scenario.initial.compensation) {
        await db.booking.create({ data: actors.bookingStates.previous })
        await seedEntitlement(db, actors, clock.now())
      }
    }
    const navigation = createPhase9RouteProvider({ db: database.client, clock })
    s = { ...await createPhase9Lifecycle(database, { clock, fare: scenario.initial.fare, beforeBooking, navigation }),
      database, navigation, events: [], snapshots: new Map(), refundId: null }
    s.record = () => {}
    const map = createPhase9CanonicalMap()
    registerPhase9Actors(map, s.actors)
    const initial = await stateForReplay(s)
    for (const event of scenario.events) {
      clock.set(event.at)
      await syncDatabaseTime()
      const outcome = await executePhase9Event(s, event)
      if (Object.hasOwn(event, 'expected')) assert.deepEqual(outcome, event.expected, `event ${event.sequence}: ${event.type}`)
      s.events.push({ sequence: event.sequence, at: event.at, type: event.type, outcome })
      await assertJourneyWallets(s)
    }
    const final = await stateForReplay(s)
    const canonical = canonicalPhase9State(map, final)
    const report = { schema: 'rcs-phase9-replay-result-v1', scenarioId: scenario.id, inputIntegrity: scenario.integrity,
      initial: canonicalPhase9State(map, initial), events: map.normalize(s.events), final: canonical, aliases: map.manifest(), syntheticOnly: true }
    report.outcomeDigest = digest({ initial: report.initial, events: report.events, final: report.final })
    return report
  } finally {
    if (s) await s.close()
    restoreTime()
    await database.close()
  }
}

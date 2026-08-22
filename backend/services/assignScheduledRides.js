import { prisma } from '../db/prisma.js'
import { notifyWhatsAppAdminUnassigned, sendScheduledRideReminders } from './notification.js'
import { offerScheduledRide } from './scheduledOffers.js'
import { ASSIGNMENT_HORIZON_H, SWEEP_INTERVAL_MS, ADMIN_ALERT_LEAD_MS } from '../constants/dispatch.js'

// Puts scheduled bookings in front of drivers ahead of their pickup, and tells
// Raju when one still hasn't been taken in the last hour.
//
// This no longer ASSIGNS anything. It creates offers (services/scheduledOffers.js)
// and the driver accepts through the app, because a scheduled ride is offered to
// drivers who are offline at the time and an offer they cannot answer yet has to
// outlive this sweep. Assignment happens in the accept endpoint.
//
// Retry cadence is the spec's: every 5 minutes, and it KEEPS RETRYING after Raju
// has been told. Being unable to fill a ride is not a reason to stop trying to
// fill it — that was the easiest thing to get wrong here.
/**
 * One pass: offer every unfilled scheduled booking inside the horizon, and alert
 * Raju about the ones inside the last hour.
 *
 * Split out from the timer below so the same body can be driven two ways — a
 * setInterval in development, an authenticated POST from Cloud Scheduler in
 * production (see lib/jobs.js for why the second exists). The sweep itself does
 * not care which called it, and must not: a job that behaves differently
 * depending on its trigger is a job you cannot test locally.
 *
 * Swallows its own errors, exactly as it did inside the timer. That means the
 * HTTP trigger answers 200 even on a bad pass and Cloud Scheduler will not
 * retry — which is correct here, because the next scheduled run is five minutes
 * away and a retry would just repeat the same failing queries sooner.
 */
export async function sweepScheduledRides() {
  try {
    const now = Date.now()
    await sendScheduledRideReminders(new Date(now))
    const horizon = new Date(now + ASSIGNMENT_HORIZON_H * 60 * 60 * 1000)

    const unfilled = await prisma.booking.findMany({
      where: {
        status: 'confirmed',
        driverId: null,
        scheduledAt: { lte: horizon, gte: new Date(now) },
      },
      select: { id: true, reference: true, scheduledAt: true, adminAlertedAt: true,
        customerPhone: true, pickupAddress: true, dropAddress: true,
        user: { select: { name: true } } },
    })

    for (const booking of unfilled) {
      try {
        await offerScheduledRide(booking.id)
      } catch (err) {
        // One booking failing must not abandon the rest of the sweep.
        console.error(`offer sweep failed for booking ${booking.id}:`, err)
      }

      const insideLastHour = booking.scheduledAt.getTime() - now <= ADMIN_ALERT_LEAD_MS
      if (!insideLastHour || booking.adminAlertedAt) continue

      // Stamped BEFORE the send and guarded on still being null, so a slow or
      // failing WhatsApp call cannot produce twelve identical billed messages
      // across the last hour. Losing one alert to a failed send is the better
      // failure — the sweep keeps running either way.
      const { count } = await prisma.booking.updateMany({
        where: { id: booking.id, adminAlertedAt: null },
        data: { adminAlertedAt: new Date() },
      })
      if (count === 0) continue

      await notifyWhatsAppAdminUnassigned(booking)
    }
  } catch (err) {
    console.error('Assignment job failed:', err)
  }
}

export default function startAssignmentJob() {
  // setInterval does not wait for the previous run, so two sweeps could overlap
  // and offer the same booking twice. The unique on RideOffer now makes a double
  // offer impossible, but overlapping sweeps still waste queries against a
  // free-tier database, so the run is guarded outright.
  //
  // The guard is per-process and always was. Two Render instances, or two Cloud
  // Run instances, can still sweep at the same moment — which is safe for the
  // reason above and not for this flag's benefit. runJob in lib/jobs.js holds the
  // equivalent guard for the HTTP trigger.
  let running = false

  setInterval(async () => {
    if (running) return
    running = true
    try {
      await sweepScheduledRides()
    } finally {
      running = false
    }
  }, SWEEP_INTERVAL_MS)
}

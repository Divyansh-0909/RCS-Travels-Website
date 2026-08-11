import { prisma } from '../db/prisma.js'
import { sendWhatsApp } from './notification.js'
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
export default function startAssignmentJob() {
  // setInterval does not wait for the previous run, so two sweeps could overlap
  // and offer the same booking twice. The unique on RideOffer now makes a double
  // offer impossible, but overlapping sweeps still waste queries against a
  // free-tier database, so the run is guarded outright.
  let running = false

  setInterval(async () => {
    if (running) return
    running = true

    try {
      const now = Date.now()
      const horizon = new Date(now + ASSIGNMENT_HORIZON_H * 60 * 60 * 1000)

      const unfilled = await prisma.booking.findMany({
        where: {
          status: 'confirmed',
          driverId: null,
          scheduledAt: { lte: horizon, gte: new Date(now) },
        },
        select: { id: true, scheduledAt: true, adminAlertedAt: true },
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

        sendWhatsApp(
          process.env.ADMIN_PHONE,
          `No driver has accepted booking ${booking.id}. Pickup at ${booking.scheduledAt}. Please assign manually.`,
        )
      }
    } catch (err) {
      console.error('Assignment job failed:', err)
    } finally {
      running = false
    }
  }, SWEEP_INTERVAL_MS)
}

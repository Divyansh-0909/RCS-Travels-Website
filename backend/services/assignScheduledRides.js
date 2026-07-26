import { prisma } from '../db/prisma.js'
import { getDriver } from './driverAssignment.js'
import { sendWhatsApp } from './notification.js'

// Assigns drivers to scheduled bookings ahead of their pickup time, and nags the
// admin when one can't be filled in the last hour.
//
// Two known defects, spelled out in ROADMAP: the 12-hour window is ~12x wider than
// the 60-minute spec, so a ride booked half a day out gets a full driver sweep every
// 5 minutes for nothing; and setInterval doesn't wait for the previous run, so two
// sweeps can overlap and offer the same booking to the same driver twice. Both stay
// invisible while FCM is stubbed and bite the moment it isn't.
export default function startAssignmentJob() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() + 12 * 60 * 60 * 1000)

      const unassignedBookings = await prisma.booking.findMany({
        where: {
          status:      'confirmed',
          scheduledAt: { lte: cutoff },
        },
        include: { user: true },
      })

      for (const booking of unassignedBookings) {
        const assignedDriverId = await getDriver(booking.id)

        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
        if (!assignedDriverId && booking.scheduledAt <= oneHourFromNow) {
          sendWhatsApp(process.env.ADMIN_PHONE, `No driver found for booking ${booking.id}. Pickup at ${booking.scheduledAt}. Please assign manually.`)
        }
      }
    } catch (err) {
      console.error('Assignment job failed:', err)
    }
  }, 5 * 60 * 1000)
}

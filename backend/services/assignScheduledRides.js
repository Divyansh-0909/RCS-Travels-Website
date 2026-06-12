import { prisma } from '../db/prisma.js'
import { getDriver } from './driverAssignment.js'
import { sendWhatsApp } from './notification.js'

export default function startAssignmentJob() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() + 12 * 60 * 60 * 1000)

      const unassignedBookings = await prisma.booking.findMany({
        where: {
          status:      'confirmed',
          scheduledAt: { lte: cutoff },
        },
      })

      for (const booking of unassignedBookings) {
        const assignedDriverId = await getDriver(booking.id)

        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
        if (!assignedDriverId && booking.scheduledAt <= oneHourFromNow) {
          sendWhatsApp(process.env.ADMIN_PHONE, `No driver found for booking ${booking.bookingCode}. Pickup at ${booking.scheduledAt}. Please assign manually.`)
        }
      }
    } catch (err) {
      console.error('Assignment job failed:', err)
    }
  }, 5 * 60 * 1000)
}

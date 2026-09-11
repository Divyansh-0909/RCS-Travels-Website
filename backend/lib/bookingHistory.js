const IST_OFFSET_MS = 330 * 60 * 1000
const BOOKING_HISTORY_MONTHS = 3

// The booking lists use the ride's effective history moment: completion when it
// exists, otherwise the scheduled time, otherwise creation time for an immediate
// ride. Keep the three-month boundary on the service's IST calendar and clamp the
// day when the target month is shorter (for example, 31 May -> 28/29 February).
export function bookingHistoryCutoff(now = new Date()) {
    const ist = new Date(now.getTime() + IST_OFFSET_MS)
    const day = ist.getUTCDate()

    ist.setUTCDate(1)
    ist.setUTCMonth(ist.getUTCMonth() - BOOKING_HISTORY_MONTHS)
    const lastDay = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 0)).getUTCDate()
    ist.setUTCDate(Math.min(day, lastDay))

    return new Date(ist.getTime() - IST_OFFSET_MS)
}

export function recentBookingHistoryWhere(now = new Date()) {
    const cutoff = bookingHistoryCutoff(now)

    return {
        OR: [
            { completedAt: { gte: cutoff } },
            { completedAt: null, scheduledAt: { gte: cutoff } },
            { completedAt: null, scheduledAt: null, createdAt: { gte: cutoff } },
        ],
    }
}

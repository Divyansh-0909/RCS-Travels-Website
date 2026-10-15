export const scheduledBookingNeedsTime = (timing, scheduledTime, hasBooking) =>
    timing === 'Schedule' && !scheduledTime && !hasBooking;

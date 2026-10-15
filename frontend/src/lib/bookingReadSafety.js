export function isVerifiedBookingRead(read, bookingId, userId) {
    return typeof userId === 'string' && userId.length > 0
        && read?.bookingId === bookingId && read?.userId === userId;
}

export function bookingReadIsDenied(result) {
    return [401, 403, 404].includes(result?.status);
}

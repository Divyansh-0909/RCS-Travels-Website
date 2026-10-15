// Matches the existing protected driver cancellation stage contract.
export function canCancelDriverRide(status: unknown) {
    return ['assigned', 'en_route', 'reached'].includes(status as string);
}

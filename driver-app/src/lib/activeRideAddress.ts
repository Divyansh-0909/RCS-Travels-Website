import type { UpcomingBooking } from '../types/enums';

export function activeRideAddress(ride: Pick<UpcomingBooking, 'pickupAddress' | 'dropAddress'>, endpoint: 'pickup' | 'drop') {
  return endpoint === 'drop' ? ride.dropAddress : ride.pickupAddress;
}

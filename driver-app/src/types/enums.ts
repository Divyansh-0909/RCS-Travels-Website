export type UpcomingBooking = {
  id: string;
  status: string;
  pickupAddress: string;
  dropAddress: string;
  scheduledAt: string;
  fare: number;
  vehicleClass: string;
  sharing: boolean;
  isOutstation: boolean;
};
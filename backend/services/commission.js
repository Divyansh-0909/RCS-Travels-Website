export const COMMISSION_PCT = 5
export const COMMISSION_MIN_FARE = 800

/**
 * @param rideFare the driving fare alone, with pass-through charges already
 *                 stripped out — see rideFareOf() for what counts.
 */
export function commissionOn(rideFare) {
  if (!(rideFare >= COMMISSION_MIN_FARE)) return { pct: 0, amt: 0 }
  return { pct: COMMISSION_PCT, amt: Math.round((rideFare * COMMISSION_PCT) / 100) }
}

/**
 * The part of a total that commission is charged on.
 *
 * Commission is a cut of the driving, so money that only passes through the
 * driver's hands on its way to somebody else is taken off first: a toll paid at
 * a barrier, parking paid at a gate, the airport's access fee, and the roof
 * carrier. The provider was explicit about the carrier, the toll and parking;
 * the airport fee is the same kind of thing and is treated the same way.
 *
 * The safer-route surcharge is NOT stripped. That one buys a longer drive on a
 * lit road — it is the driver's own work, not a third party's fee, so it earns
 * commission like the rest of the fare does.
 *
 * !! Any new flat add-on has to be passed in here, or it will quietly start
 * paying commission the day it ships.
 */
export function rideFareOf(total, { toll = 0, parking = 0, airport = 0, carrier = 0 } = {}) {
  return Math.max(0, total - toll - parking - airport - carrier)
}

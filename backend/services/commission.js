export const COMMISSION_PCT = 5
export const COMMISSION_MIN_FARE = 800

/**
 * The ₹800 floor is tested against what the customer ACTUALLY PAYS — after the
 * coupon, not before it (decided 14 Aug 2026, supersedes the earlier reading).
 * A ₹1,200 ride with a ₹500 coupon is a ₹700 ride for this purpose and earns no
 * commission.
 *
 * !! THE ARGUMENT IS AN OBJECT ON PURPOSE. This used to take a bare `rideFare`
 * number, and the whole risk in this change is a call site that keeps passing
 * the PRE-coupon fare and silently over-charges commission. A number now throws
 * instead of quietly computing the old answer — the mistake is not expressible.
 *
 * @param rideFare      driving fare alone, pass-through charges already stripped
 *                      out by rideFareOf().
 * @param couponAmount  the coupon applied to this booking, 0 when there is none.
 */
export function commissionOn(args) {
  if (typeof args !== 'object' || args === null) {
    throw new TypeError(
      'commissionOn({ rideFare, couponAmount }) — a bare fare is refused because ' +
      'the ₹800 floor must be tested AFTER the coupon.',
    )
  }
  const { rideFare, couponAmount = 0 } = args
  const payableRideFare = Math.max(0, rideFare - couponAmount)
  if (!(payableRideFare >= COMMISSION_MIN_FARE)) return { pct: 0, amt: 0, payableRideFare }
  return {
    pct: COMMISSION_PCT,
    amt: Math.round((payableRideFare * COMMISSION_PCT) / 100),
    payableRideFare,
  }
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

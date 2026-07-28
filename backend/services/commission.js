// What the provider keeps from each ride.
//
// Their own sheet (Jul 2026) is not a percentage — it is a flat ₹25 per leg,
// with ₹100 on three long Delhi runs:
//
//   Botanical Garden      800 / 25    3.13%      Anand Vihar rly    1000 / 100   10.00%
//   Sector 62 / i-ON      800 / 25    3.13%      H Nizamuddin rly   1000 / 100   10.00%
//   RD Engineering        800 / 25    3.13%      IGI Airport        1400 / 100    7.14%
//   Ghaziabad rly         700 / 25    3.57%      BBD both sides     1500 / 50     3.33%
//   BBD exam centre       850 / 25    2.94%      RD round trip      1500 / 50     3.33%
//
// (₹50 is just ₹25 twice — both of those are round trips.)
//
// Asked for one rate to cover all of it, 5% is the rate that collects what the
// sheet collects across that mix — ₹518 against their ₹525, within 1.4%.
//
// With the ₹800 floor below applied it comes to ₹483, about 8% under, and all of
// that gap is one ride: Ghaziabad at ₹700 is charged ₹25 on the sheet but sits
// under the floor we were told to use, so it now earns nothing. 5.5% would put
// the total back to ₹531 if that matters more than a round number.
//
// It also moves money around, in a direction worth knowing about: the three ₹100
// runs are long Delhi trips that tie a driver up for half a day, and a flat rate
// roughly halves those (Nizamuddin ₹100 → ₹50) while raising the short local ones
// (Botanical ₹25 → ₹40). If the provider objects, the honest fix is not a
// different percentage but a per-destination override, the way fare zones work.
export const COMMISSION_PCT = 5

// Below this the provider takes nothing. Tested against the ride fare for the
// WHOLE booking — both legs of a round trip together — so a ₹450-each-way return
// qualifies where a single ₹450 leg would not.
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

const MARKET_RATE = { pickup: 60, perKm: 4.7, perMin: 5.3, minimum: 130 }

export const CLASS_FROM_HATCHBACK = {
  hatchback: (fare) => fare,
  sedan: (fare) => fare + 100,
  suv: (fare) => fare * 1.6,
  suv_premium: (fare) => fare * 2.75,
}

const gridOf = (source) => (source === 'per_km' ? 10 : 50)
const roundTo = (value, step) => Math.round(value / step) * step

export function classFareFromHatchback(hatchbackFare, vehicleClass, source) {
  const modify = CLASS_FROM_HATCHBACK[vehicleClass]
  if (!Number.isFinite(hatchbackFare) || !modify) return null
  return roundTo(modify(hatchbackFare), gridOf(source))
}

export const AIRPORT_PICKUP_SURCHARGE = 200

export function marketFare(distanceKm, durationMin) {
  const time = durationMin != null ? MARKET_RATE.perMin * durationMin : 0
  const fare = Math.max(
    MARKET_RATE.minimum,
    MARKET_RATE.pickup + MARKET_RATE.perKm * distanceKm + time,
  )
  return Math.round(fare / 10) * 10
}

const FAR_KM = 56
const FAR_RATE = 16
const FAR_BASE = 36.7 * Math.pow(FAR_KM, 0.897)
const PREMIUM_BANDS = [
  { from: 20, to: 25, bump: 50 },
  { from: 49, to: 52, bump: 50 },
]

const rawCurve = (km) => {
  let base = km <= FAR_KM
    ? 36.7 * Math.pow(km, 0.897)
    : FAR_BASE + FAR_RATE * (km - FAR_KM)
  for (const band of PREMIUM_BANDS) {
    if (km >= band.from && km <= band.to) base += band.bump
  }
  return base
}

export function formulaFare(distanceKm) {
  let base = rawCurve(distanceKm)
  for (const band of PREMIUM_BANDS) {
    if (distanceKm > band.to) base = Math.max(base, rawCurve(band.to))
  }
  return Math.round(Math.max(400, base) / 50) * 50
}

export const SAFE_ROUTE_SURCHARGE = 150
export const CARRIER_CHARGE = 200
const CARRIER_WAIVED_AT = 2000
export const SHARING_DISCOUNT_PCT = 25

export function priceFareCard({
  base,
  source,
  toll = 0,
  airport = 0,
  surcharge = 0,
  needsCarrier = false,
}) {
  const carrier = needsCarrier && base + toll < CARRIER_WAIVED_AT ? CARRIER_CHARGE : 0
  const extras = surcharge + toll + airport + carrier
  return {
    solo: base + extras,
    sharing: Math.round((base * (100 - SHARING_DISCOUNT_PCT)) / 100 / 10) * 10 + extras,
    source,
    toll,
    airport,
    carrier,
    carrierWaived: Boolean(needsCarrier) && carrier === 0,
  }
}

import { VEHICLE_CLASS_NAMES } from '../constants/vehicles.js'
import { isAirportPickup, isNearCampus, matchZone } from './fareZones.js'
import { signQuote } from './fareQuote.js'
import {
  AIRPORT_PICKUP_SURCHARGE,
  SAFE_ROUTE_SURCHARGE,
  classFareFromHatchback,
  formulaFare,
  marketFare,
  priceFareCard,
} from './ridePricing.js'
import { bestEffortRouteOptions, routeMetrics } from './rideRouteOptions.js'

export {
  AIRPORT_PICKUP_SURCHARGE,
  CARRIER_CHARGE,
  CLASS_FROM_HATCHBACK,
  SAFE_ROUTE_SURCHARGE,
  SHARING_DISCOUNT_PCT,
  classFareFromHatchback,
  formulaFare,
  marketFare,
  priceFareCard,
} from './ridePricing.js'

export {
  getNavigationEtaMinutes,
  getNavigationRoute,
  navigationRouteNeedsRefresh,
  routeSequence,
} from './googleRoutes.js'

export async function getRideEstimate({
  pickupAddress,
  dropAddress,
  vehicleClass,
  pickupCoords,
  dropCoords,
  preferSafeRoute,
  needsCarrier,
  coupon = null,
}) {
  const pickupOnCampus = Boolean(pickupCoords && isNearCampus(pickupCoords))
  const dropOnCampus = Boolean(dropCoords && isNearCampus(dropCoords))
  const campusAnchored = pickupOnCampus || dropOnCampus

  const zoneCoords = !campusAnchored
    ? null
    : dropCoords && !isNearCampus(dropCoords)
      ? dropCoords
      : pickupCoords && !isNearCampus(pickupCoords)
        ? pickupCoords
        : null
  const zone = matchZone(zoneCoords)

  const options = await bestEffortRouteOptions({
    pickupAddress,
    dropAddress,
    pickupCoords,
    dropCoords,
    pickupOnCampus,
    dropOnCampus,
    preferSafeRoute,
  })

  const applied = Boolean(preferSafeRoute && options.safe)
  const surcharge = applied ? SAFE_ROUTE_SURCHARGE : 0
  const metrics = routeMetrics(applied ? options.safe : options.primary)

  const safeRouteInfo = options.safe || options.candidate
    ? {
        available: true,
        applied,
        fee: SAFE_ROUTE_SURCHARGE,
        waypoint: options.waypoint,
      }
    : { available: false, applied: false, fee: 0, waypoint: null }

  const airport = !campusAnchored && isAirportPickup(pickupCoords)
    ? AIRPORT_PICKUP_SURCHARGE
    : 0

  function hatchbackFrom(source) {
    switch (source) {
      case 'zone': {
        const fare = zone?.fares?.hatchback
        return fare != null
          ? { base: fare, source: 'zone', toll: zone.toll, airport: 0 }
          : null
      }
      case 'formula':
        return {
          base: formulaFare(metrics.distanceKm),
          source: 'formula',
          toll: 0,
          airport: 0,
        }
      case 'per_km':
        return {
          base: marketFare(metrics.distanceKm, metrics.durationMin),
          source: 'per_km',
          toll: 0,
          airport,
        }
      default:
        return null
    }
  }

  const sources = campusAnchored
    ? ['zone', ...(metrics.distanceKm != null ? ['formula'] : [])]
    : metrics.distanceKm != null
      ? ['per_km']
      : []

  let hatchback = null
  for (const source of sources) {
    hatchback = hatchbackFrom(source)
    if (hatchback) break
  }
  if (!hatchback) throw new Error('No route found between the given addresses')

  const fares = {}
  for (const vehicleName of VEHICLE_CLASS_NAMES) {
    const base = classFareFromHatchback(hatchback.base, vehicleName, hatchback.source)
    if (base == null) continue
    fares[vehicleName] = priceFareCard({
      ...hatchback,
      base,
      surcharge,
      needsCarrier,
    })
  }

  const selected = fares[vehicleClass] ?? Object.values(fares)[0]
  const quote = signQuote({
    pickup: { address: pickupAddress, coords: pickupCoords ?? null },
    drop: { address: dropAddress, coords: dropCoords ?? null },
    fares,
    distanceKm: metrics.distanceKm,
    durationMin: metrics.durationMin,
    polyline: metrics.polyline,
    safeRoute: { applied, waypoint: safeRouteInfo.waypoint },
    needsCarrier: Boolean(needsCarrier),
    coupon,
  })

  return {
    quote,
    fares,
    fare: selected?.solo ?? null,
    fareSource: selected?.source ?? null,
    toll: selected?.toll ?? 0,
    airport: selected?.airport ?? 0,
    carrier: selected?.carrier ?? 0,
    carrierWaived: selected?.carrierWaived ?? false,
    zoneName: zone?.name ?? null,
    safeRoute: safeRouteInfo,
    ...metrics,
  }
}

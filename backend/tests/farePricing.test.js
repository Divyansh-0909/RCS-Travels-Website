import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  CARRIER_CHARGE,
  SAFE_ROUTE_SURCHARGE,
  classFareFromHatchback,
  formulaFare,
  marketFare,
  priceFareCard,
} from '../services/rideEstimate.js'
import { resolveZoneHits } from '../services/fareZones.js'
import { fareZoneCollectionSchema } from '../types.ts'

describe('vehicle classes have one fare source', () => {
  test('derives every class from the hatchback fare on the rate-card grid', () => {
    assert.equal(classFareFromHatchback(1200, 'hatchback', 'zone'), 1200)
    assert.equal(classFareFromHatchback(1200, 'sedan', 'zone'), 1300)
    assert.equal(classFareFromHatchback(1200, 'suv', 'zone'), 1900)
    assert.equal(classFareFromHatchback(1200, 'suv_premium', 'zone'), 3300)
  })

  test('uses the tighter ten-rupee grid for market fares', () => {
    assert.equal(classFareFromHatchback(430, 'suv', 'per_km'), 690)
    assert.equal(classFareFromHatchback(430, 'suv_premium', 'per_km'), 1180)
  })

  test('refuses unknown classes and invalid base fares', () => {
    assert.equal(classFareFromHatchback(1000, 'limousine', 'zone'), null)
    assert.equal(classFareFromHatchback(Number.NaN, 'sedan', 'zone'), null)
  })
})

describe('fare components', () => {
  test('discounts only the ride and adds pass-through charges afterwards', () => {
    assert.deepEqual(priceFareCard({
      base: 1000,
      source: 'zone',
      toll: 200,
      airport: 100,
      surcharge: SAFE_ROUTE_SURCHARGE,
      needsCarrier: true,
    }), {
      solo: 1650,
      sharing: 1400,
      source: 'zone',
      toll: 200,
      airport: 100,
      carrier: CARRIER_CHARGE,
      carrierWaived: false,
    })
  })

  test('waives the carrier at the threshold without discounting other extras', () => {
    const fare = priceFareCard({ base: 1800, source: 'zone', toll: 200, surcharge: 150, needsCarrier: true })
    assert.equal(fare.carrier, 0)
    assert.equal(fare.carrierWaived, true)
    assert.equal(fare.solo, 2150)
    assert.equal(fare.sharing, 1700)
  })

  test('keeps the fallback curve monotonic after premium bands', () => {
    assert.ok(formulaFare(25.1) >= formulaFare(25))
    assert.ok(formulaFare(52.1) >= formulaFare(52))
  })

  test('market pricing keeps its floor and ten-rupee grid', () => {
    assert.equal(marketFare(1, 1), 130)
    assert.equal(marketFare(10, 20) % 10, 0)
  })
})

describe('fare-zone boundaries and persistence', () => {
  test('blends the hatchback source once and keeps the higher toll', () => {
    const result = resolveZoneHits([
      { name: 'A', priority: 5, fares: { hatchback: 1100 }, toll: 0 },
      { name: 'B', priority: 4, fares: { hatchback: 1200 }, toll: 200 },
    ])
    assert.deepEqual(result.fares, { hatchback: 1150 })
    assert.equal(result.toll, 200)
    assert.equal(result.blended, true)
  })

  test('a deliberate higher-priority exception wins instead of blending', () => {
    const result = resolveZoneHits([
      { name: 'Broad zone', priority: 2, fares: { hatchback: 900 }, toll: 0 },
      { name: 'Exception', priority: 5, fares: { hatchback: 1200 }, toll: 0 },
    ])
    assert.equal(result.name, 'Exception')
    assert.equal(result.fares.hatchback, 1200)
  })

  test('admin saves persist only the hatchback source fare', () => {
    const parsed = fareZoneCollectionSchema.parse({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: 'Test zone',
          priority: 1,
          fares: { hatchback: 800, sedan: 5000, suv: 6000, suv_premium: 7000 },
        },
        geometry: { type: 'Polygon', coordinates: [[[77, 28], [78, 28], [78, 29], [77, 28]]] },
      }],
    })
    assert.deepEqual(parsed.features[0].properties.fares, { hatchback: 800 })
  })
})

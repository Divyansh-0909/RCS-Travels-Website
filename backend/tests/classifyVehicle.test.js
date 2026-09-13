import assert from 'node:assert/strict'
import test from 'node:test'

import { VehicleClass } from '@prisma/client'

process.env.OPENAI_API_KEY ||= 'test-only-openai-key'

const {
  classifyVehicleDetails,
  normalizeVehicleCacheKey,
  PREMIUM_MIN_SEATS,
  PREMIUM_PRICE,
  shouldUseWebLookup,
} = await import('../services/AI/classifyVehicle.ts')

const vehicle = (overrides = {}) => ({
  normalizedModel: 'Example Car',
  bodyType: 'suv',
  seats: PREMIUM_MIN_SEATS,
  basePrice: PREMIUM_PRICE,
  confidence: 0.95,
  ...overrides,
})

test('maps hatchbacks and compact sedans to their fixed RCS classes', () => {
  assert.equal(
    classifyVehicleDetails(vehicle({ bodyType: 'hatchback', seats: 5, basePrice: 900_000 })),
    VehicleClass.hatchback,
  )
  assert.equal(
    classifyVehicleDetails(vehicle({ bodyType: 'compact_sedan', seats: 5, basePrice: 1_100_000 })),
    VehicleClass.sedan,
  )
})

test('requires both 7+ total seats and a base price strictly above 17 lakh for premium', () => {
  assert.equal(
    classifyVehicleDetails(vehicle({ bodyType: 'mpv', basePrice: PREMIUM_PRICE })),
    VehicleClass.suv,
  )
  assert.equal(
    classifyVehicleDetails(vehicle({ bodyType: 'crossover', basePrice: PREMIUM_PRICE + 1 })),
    VehicleClass.suv_premium,
  )
  assert.equal(
    classifyVehicleDetails(vehicle({ seats: PREMIUM_MIN_SEATS - 1, basePrice: 4_000_000 })),
    VehicleClass.suv,
  )
})

test('does not guess an SUV class when premium-decisive facts remain unresolved', () => {
  assert.equal(classifyVehicleDetails(vehicle({ seats: null })), null)
  assert.equal(classifyVehicleDetails(vehicle({ basePrice: null })), null)
  assert.equal(classifyVehicleDetails(vehicle({ confidence: 0.4 })), null)
})

test('only sends classification-critical cases to web lookup', () => {
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'hatchback', seats: 5 })), false)
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'sedan', seats: null })), false)
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'suv', seats: 5 })), false)
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'suv', seats: PREMIUM_MIN_SEATS })), true)
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'suv', seats: null })), true)
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'sedan', confidence: 0.4 })), true)
  assert.equal(shouldUseWebLookup(vehicle({ bodyType: 'sedan', normalizedModel: null })), true)
})

test('normalizes common model spellings to the same cache key', () => {
  assert.equal(normalizeVehicleCacheKey(' XUV 700 '), 'xuv700')
  assert.equal(normalizeVehicleCacheKey('xuv-700'), 'xuv700')
  assert.equal(normalizeVehicleCacheKey('XUV700'), 'xuv700')
})

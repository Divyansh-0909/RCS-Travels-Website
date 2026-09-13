import assert from 'node:assert/strict'
import test from 'node:test'

import { driverAccountInformationSchema } from '../types.ts'

test('driver registration creates the profile from the captain name before a vehicle exists', () => {
  const parsed = driverAccountInformationSchema.safeParse({ name: 'Ravi Kumar' })

  assert.equal(parsed.success, true)
  assert.deepEqual(parsed.data, { name: 'Ravi Kumar' })
})

test('driver registration still rejects an invalid captain name', () => {
  assert.equal(driverAccountInformationSchema.safeParse({ name: 'R' }).success, false)
})

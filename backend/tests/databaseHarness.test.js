import test from 'node:test'
import assert from 'node:assert/strict'
import { testDatabaseUrl, failFirst } from './helpers/database.js'

test('isolated database configuration rejects runtime/remote/redirected URLs', () => {
  for (const value of ['', 'bad', 'postgresql://example.com/rcs_test',
    'postgresql://localhost/production', 'postgresql://localhost/test?host=example.com']) {
    assert.throws(() => testDatabaseUrl(value))
  }
  assert.equal(testDatabaseUrl('postgresql://localhost/rcs_test').pathname, '/rcs_test')
})

test('retry injection fails at a known call boundary without waiting', () => {
  let effects = 0
  const operation = failFirst(2, () => ++effects)
  assert.throws(operation, { code: 'P2034' })
  assert.throws(operation, { code: 'P2034' })
  assert.equal(operation(), 1)
  assert.equal(effects, 1)
})

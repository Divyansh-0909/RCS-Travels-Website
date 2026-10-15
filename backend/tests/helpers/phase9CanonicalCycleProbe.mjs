import assert from 'node:assert/strict'
import { createPhase9CanonicalMap } from './phase9ReplayCanonical.js'

const map = createPhase9CanonicalMap()
map.register('cyclic-identity-long', '@cycle:cyclic-identity-long')
assert.throws(() => map.normalize('cyclic-identity-long'), /cyclic canonical identity/)

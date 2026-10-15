import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestSequence } from '../src/lib/requestSequence.js';

test('only the newest fare request can publish, including pending/failed state', () => {
    const sequence = createRequestSequence();
    const first = sequence.begin();
    assert.equal(first(), true);
    const second = sequence.begin();
    assert.equal(first(), false);
    assert.equal(second(), true);
    const third = sequence.begin();
    assert.equal(second(), false);
    assert.equal(first(), false);
    assert.equal(third(), true);
});

test('unmount invalidates all requests and a new mounted request has independent authority', () => {
    const sequence = createRequestSequence();
    const first = sequence.begin();
    sequence.invalidate();
    assert.equal(first(), false);
    const second = sequence.begin();
    assert.equal(second(), true);
    assert.equal(first(), false);
    sequence.invalidate();
    sequence.invalidate();
    assert.equal(second(), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_RATE_LIMIT_COOLDOWN_MS,
    MAX_RATE_LIMIT_COOLDOWN_MS,
    getRetryAfterMs,
} from '../src/api/rateLimit.js';

const NOW = Date.parse('2026-09-21T00:00:00Z');

test('uses Retry-After seconds from the response header', () => {
    assert.equal(getRetryAfterMs('12', { retryAfter: 4 }, NOW), 12_000);
});

test('uses an HTTP-date Retry-After header', () => {
    assert.equal(getRetryAfterMs('Mon, 21 Sep 2026 00:00:07 GMT', {}, NOW), 7_000);
});

test('uses retryAfter seconds from the JSON body when the header is absent', () => {
    assert.equal(getRetryAfterMs(null, { details: { retry_after: '9' } }, NOW), 9_000);
});

test('uses a millisecond body value and bounds it', () => {
    assert.equal(getRetryAfterMs(null, { retryAfterMs: MAX_RATE_LIMIT_COOLDOWN_MS + 1 }, NOW), MAX_RATE_LIMIT_COOLDOWN_MS);
});

test('falls back to a conservative cooldown for missing or invalid values', () => {
    assert.equal(getRetryAfterMs('invalid', { retryAfter: 'later' }, NOW), DEFAULT_RATE_LIMIT_COOLDOWN_MS);
});

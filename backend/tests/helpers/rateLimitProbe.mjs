// Manual local-only multi-process probe. No production routes, credentials or data.
// server: node backend/tests/helpers/rateLimitProbe.mjs server
// client: node backend/tests/helpers/rateLimitProbe.mjs client <loopback-url> <identity>
import express from 'express';
import assert from 'node:assert/strict';
import { createApiLimiters } from '../../middleware/rateLimit.js';

if (process.argv[2] === 'server') {
    const app = express();
    const waiting = [];
    app.get('/ready', (_req, res) => {
        waiting.push(res);
        if (waiting.length === 2) waiting.splice(0).forEach(response => response.json({ start: true }));
    });
    const limits = createApiLimiters({ getUserId: req => req.get('x-test-user') });
    app.use('/api', limits.read, limits.write, limits.location);
    app.get('/api/admin/drivers/test/documents', (_req, res) => res.json({ test: true }));
    const server = app.listen(0, '127.0.0.1', () => console.log(`LOCAL_PROBE=http://127.0.0.1:${server.address().port}`));
} else {
    const url = new URL(process.argv[3]);
    assert.equal(url.hostname, '127.0.0.1', 'probe only permits loopback');
    const user = process.argv[4];
    assert.ok(user);
    await fetch(`${url.origin}/ready`, { signal: AbortSignal.timeout(120000) });
    const counts = {};
    for (let batch = 0; batch < 13; batch++) {
        const statuses = await Promise.all(Array.from({ length: 100 }, async () => {
            const response = await fetch(`${url.origin}/api/admin/drivers/test/documents`, {
                headers: { 'x-test-user': user }, signal: AbortSignal.timeout(15000),
            });
            await response.arrayBuffer();
            return response.status;
        }));
        for (const status of statuses) counts[status] = (counts[status] || 0) + 1;
    }
    assert.deepEqual(counts, { 200: 1200, 429: 100 });
    console.log(JSON.stringify({ user, requests: 1300, counts, passed: true }));
}

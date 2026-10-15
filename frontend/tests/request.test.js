import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequest, retryDelay } from "../src/api/request.js";
import { nextTrackingPoll } from "../src/lib/trackingPoll.js";

const token = (sub, version = 1) => `header.${Buffer.from(JSON.stringify({ sub, sid: sub, version })).toString("base64url")}.signature`;
const limited = (policy = "api-read") => Response.json({ error: "Slow down", code: "RATE_LIMITED", policy }, { status: 429, headers: { "Retry-After": "10" } });

test("normal sequential reads stay fresh; parallel reads coalesce per account", async () => {
    let calls = 0;
    const request = createRequest("http://test", { fetchImpl: async () => { calls++; return Response.json({ calls }); } });
    const getToken = async () => token("admin-a");
    const results = await Promise.all(Array.from({ length: 100 }, () => request("/api/admin/drivers/one/documents", { getToken })));
    assert.equal(calls, 1);
    assert.ok(results.every(result => result.calls === 1));
    await request("/api/admin/drivers/one/documents", { getToken });
    assert.equal(calls, 2);
    await Promise.all(["admin-a", "admin-b"].map(sub => request("/api/users/me", { getToken: async () => token(sub) })));
    assert.equal(calls, 4);
});

test("429 pauses shared reads, survives token refresh, isolates accounts and recovers", async () => {
    let clock = 1000, calls = 0;
    const request = createRequest("http://test", { now: () => clock, fetchImpl: async () => ++calls === 1 ? limited() : Response.json({ ok: true }) });
    const getToken = async () => token("admin-a");
    assert.equal((await request("/api/admin/drivers/one/finance", { getToken })).retryAfterMs, 10000);
    for (let n = 0; n < 100; n++) {
        assert.equal((await request("/api/bookings/my-bookings?page=" + n, { getToken: async () => token("admin-a", 2) })).status, 429);
    }
    assert.equal(calls, 1);
    assert.equal((await request("/api/admin/drivers/one/documents", { getToken: async () => token("admin-b") })).ok, true);
    assert.equal(calls, 2);
    // A read cooldown must not silently block document approval or location writes.
    await request("/api/admin/documents/one/review", { method: "POST", getToken, body: { approved: true } });
    assert.equal(calls, 3);
    clock += 10001;
    assert.equal((await request("/api/users/me", { getToken })).ok, true);
    assert.equal(calls, 4);
});

test("writes never coalesce or retry and endpoint limits do not block unrelated reads", async () => {
    let calls = 0;
    const request = createRequest("http://test", { fetchImpl: async () => { calls++; return limited("fare"); } });
    await Promise.all(Array.from({ length: 3 }, () => request("/api/bookings", { method: "POST" })));
    assert.equal(calls, 3);
    await request("/api/fare");
    await request("/api/fare");
    assert.equal(calls, 4);
    await request("/api/users/me");
    assert.equal(calls, 5);
});

test("cancelable requests retain independent abort ownership and failures do not stay cached", async () => {
    let calls = 0;
    const request = createRequest("http://test", { fetchImpl: async (_url, { signal }) => {
        calls++;
        signal?.throwIfAborted();
        return Response.json({ ok: true });
    } });
    const controller = new AbortController();
    controller.abort();
    const results = await Promise.allSettled([
        request("/api/bookings/one/status", { signal: controller.signal }),
        request("/api/bookings/one/status"),
    ]);
    assert.equal(results[0].status, "rejected");
    assert.equal(results[1].value.ok, true);
    await request("/api/bookings/one/status");
    assert.equal(calls, 3);
});

test("Retry-After handles dates and fallback; tracking recovers after HTTP errors", () => {
    assert.equal(retryDelay(new Headers({ "Retry-After": "10" }), 0), 10000);
    assert.equal(retryDelay(new Headers({ "Retry-After": "Thu, 01 Jan 1970 00:00:10 GMT" }), 0), 10000);
    assert.equal(retryDelay(new Headers()), 60000);
    assert.equal(nextTrackingPoll({ status: 429, error: "Slow down", retryAfterMs: 900000 }), 900000);
    assert.equal(nextTrackingPoll({ status: 503, error: "Unavailable" }), 5000);
    assert.equal(nextTrackingPoll({ status: 401, error: "Sign in" }), null);
    assert.equal(nextTrackingPoll({ status: "assigned" }), 5000);
    assert.equal(nextTrackingPoll({ status: "completed", ridePayment: { state: "paid" } }), null);
});

test("refresh after document approval does not coalesce with a pre-approval read", async () => {
    let release, calls = 0;
    const request = createRequest("http://test", { fetchImpl: async () => {
        calls++;
        if (calls === 1) return new Promise(resolve => { release = resolve; });
        return Response.json({ approved: true });
    } });
    const oldRead = request("/api/admin/drivers/one/documents");
    await request("/api/admin/documents/one/review", { method: "POST" });
    const freshRead = request("/api/admin/drivers/one/documents");
    assert.equal(calls, 3);
    release(Response.json({ approved: false }));
    assert.equal((await oldRead).approved, false);
    assert.equal((await freshRead).approved, true);
});

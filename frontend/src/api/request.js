const protectedRead = /^\/api\/(bookings|driver|users|admin|payments)(\/|$)/;

function identity(token) {
    if (!token) return "anonymous";
    try {
        const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const { sub, sid } = JSON.parse(atob(payload));
        if (sub) return JSON.stringify([sub, sid ?? null]);
    } catch { /* Opaque tokens still get separate local buckets. */ }
    return token;
}

export function retryDelay(headers, now = Date.now()) {
    const value = headers.get("Retry-After");
    if (value !== null && value.trim() !== "") {
        const seconds = Number(value);
        const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
        if (Number.isFinite(ms)) return Math.max(1000, Math.min(ms, 3600000));
    }
    return 60000;
}

export function createRequest(baseUrl, { fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
    const cooldowns = new Map();
    const pending = new Map();
    return async function request(path, { method = "GET", body, getToken, signal } = {}) {
        const token = getToken ? await getToken() : null;
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const owner = identity(token);
        const pathname = path.split("?")[0];
        const read = method === "GET" || method === "HEAD";
        const scope = `${owner}:${protectedRead.test(pathname) ? "api-read" : pathname}`;
        const exactScope = `${owner}:${pathname}`;
        for (const [key, entry] of cooldowns) if (entry.until <= now()) cooldowns.delete(key);
        const blocked = cooldowns.get(scope) ?? cooldowns.get(exactScope);
        if (read && blocked) return { ...blocked.result, retryAfterMs: blocked.until - now() };

        // Only coalesce reads without cancellation ownership. Never replay writes.
        const pendingKey = JSON.stringify([owner, method, path]);
        if (read && !signal && pending.has(pendingKey)) return pending.get(pendingKey);
        const run = async () => {
            const res = await fetchImpl(`${baseUrl}${path}`, {
                method, headers, body: body ? JSON.stringify(body) : undefined, signal,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const result = { ...data, error: data.error || `Server error (${res.status})`, status: res.status, code: data.code };
                if (res.status === 429) {
                    result.retryAfterMs = retryDelay(res.headers, now());
                    if (read) {
                        const key = data.policy === "api-read" && protectedRead.test(pathname) ? scope : exactScope;
                        cooldowns.set(key, { until: now() + result.retryAfterMs, result });
                    }
                }
                return result;
            }
            const data = await res.json();
            // A refresh after approval/payment must not reuse a read started
            // before that mutation committed. Existing callers can still finish.
            if (!read) {
                for (const key of pending.keys()) {
                    if (JSON.parse(key)[0] === owner) pending.delete(key);
                }
            }
            return data;
        };
        const result = run();
        if (read && !signal) pending.set(pendingKey, result);
        try { return await result; }
        finally { if (pending.get(pendingKey) === result) pending.delete(pendingKey); }
    };
}

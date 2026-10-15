export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
export const MAX_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

const boundedCooldown = (value) => Math.min(Math.max(0, Math.ceil(value)), MAX_RATE_LIMIT_COOLDOWN_MS);

const retryAfterValueToMs = (value, now) => {
    if (typeof value === 'number' && Number.isFinite(value)) return boundedCooldown(value * 1000);
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds)) return boundedCooldown(seconds * 1000);

    const date = Date.parse(trimmed);
    return Number.isNaN(date) ? null : boundedCooldown(date - now);
};

// `Retry-After` permits either seconds or an HTTP date. The backend normally
// provides the header, but accepting the equivalent JSON fields keeps mobile
// clients well behaved behind proxies which strip non-essential headers.
export const getRetryAfterMs = (headerValue, body, now = Date.now()) => {
    const fromHeader = retryAfterValueToMs(headerValue, now);
    if (fromHeader !== null) return fromHeader;

    const details = body?.details;
    const seconds = body?.retryAfter ?? body?.retry_after ?? details?.retryAfter ?? details?.retry_after;
    const fromBody = retryAfterValueToMs(seconds, now);
    if (fromBody !== null) return fromBody;

    const milliseconds = body?.retryAfterMs ?? body?.retry_after_ms ?? details?.retryAfterMs ?? details?.retry_after_ms;
    const millisecondsNumber = Number(milliseconds);
    return milliseconds !== null && milliseconds !== undefined && Number.isFinite(millisecondsNumber)
        ? boundedCooldown(millisecondsNumber)
        : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
};

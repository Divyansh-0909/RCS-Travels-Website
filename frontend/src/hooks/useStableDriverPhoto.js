import { useCallback, useRef } from "react";

const EXPIRY_BUFFER_MS = 60 * 1000;
const FALLBACK_RETAIN_MS = 14 * 60 * 1000;

const driverIdentity = (driver) =>
    driver?.id ?? driver?.phone ?? [driver?.vehicleNumber, driver?.name].filter(Boolean).join("|");

// GCS V4 signed URLs carry both the signing instant and their lifetime. Reading
// those values lets the browser keep one usable URL without duplicating the
// backend's 15-minute TTL as a second source of truth.
export function signedUrlExpiry(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        const issued = parsed.searchParams.get("X-Goog-Date");
        const expiresParam = parsed.searchParams.get("X-Goog-Expires");
        const expiresInSeconds = Number(expiresParam);
        const match = issued?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (!match || expiresParam == null || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) return null;

        const [, year, month, day, hour, minute, second] = match;
        return Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        ) + expiresInSeconds * 1000;
    } catch {
        return null;
    }
}

export function stableDriverPhoto(cache, driver, now = Date.now()) {
    if (!driver) {
        cache.identity = null;
        cache.url = null;
        cache.refreshAt = 0;
        cache.failed = false;
        return null;
    }

    const identity = driverIdentity(driver);
    const candidateUrl = driver.photoUrl ?? null;
    const driverChanged = cache.identity !== identity;
    const shouldRefresh = driverChanged || !cache.url || cache.failed || now >= cache.refreshAt;

    if (shouldRefresh) {
        const expiresAt = signedUrlExpiry(candidateUrl);
        cache.identity = identity;
        cache.url = candidateUrl;
        cache.refreshAt = candidateUrl
            ? (expiresAt == null ? now + FALLBACK_RETAIN_MS : expiresAt - EXPIRY_BUFFER_MS)
            : 0;
        cache.failed = false;
    }

    return { ...driver, photoUrl: cache.url };
}

export function useStableDriverPhoto() {
    const cacheRef = useRef({ identity: null, url: null, refreshAt: 0, failed: false });

    const stabilizeDriverPhoto = useCallback(
        (driver) => stableDriverPhoto(cacheRef.current, driver),
        [],
    );

    const markDriverPhotoFailed = useCallback((url) => {
        if (url && cacheRef.current.url === url) cacheRef.current.failed = true;
    }, []);

    return { stabilizeDriverPhoto, markDriverPhotoFailed };
}

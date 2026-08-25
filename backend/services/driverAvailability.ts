import { LOCATION_STALE_AFTER_MS } from '../constants/dispatch.js'

type LastLocation = { updatedAt: Date } | null | undefined

/**
 * The exact server-side meaning of the captain app's green Online state.
 *
 * `isOnline` records intent. Dispatchability additionally requires a recent
 * heartbeat, using the same cutoff as both geographic dispatch queries. Keeping
 * the derivation here stops /driver/me and the matching engine from explaining
 * the same row differently.
 */
export function isDriverDispatchReady(
    isOnline: boolean,
    location: LastLocation,
    now = new Date(),
) {
    return Boolean(
        isOnline &&
        location &&
        location.updatedAt.getTime() > now.getTime() - LOCATION_STALE_AFTER_MS,
    )
}

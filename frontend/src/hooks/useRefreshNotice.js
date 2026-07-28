import { create } from 'zustand'

// The "couldn't refresh" signal, for the case that sits between FailureState and
// silence: a background fetch failed, but usable content is already on screen
// (persisted store values, the previous poll's status, the last page of results).
// Taking the whole surface over with an error would be a lie — the content is
// still there and still usable — but swallowing it, which is what every one of
// these call sites used to do, leaves the rider reading stale data believing it
// is live.
//
// Deliberately NOT persisted: staleness belongs to this session's connection,
// not to the account.

// Bumped per notice so an identical message fired twice restarts the dismiss
// timer instead of being ignored as an unchanged object.
let seq = 0;

export const useRefreshNotice = create((set) => ({
    // { key, message, onRetry } | null
    notice: null,

    // `onRetry` is a live closure, so any page that passes one MUST clear on
    // unmount (see the cleanup in ManageAccount / SafetyPage / OnBoarding) —
    // otherwise the pill outlives the page and retries into a dead component.
    notifyRefreshFailed: (message, onRetry = null) =>
        set({ notice: { key: ++seq, message, onRetry } }),

    clearRefreshNotice: () => set({ notice: null }),
}))

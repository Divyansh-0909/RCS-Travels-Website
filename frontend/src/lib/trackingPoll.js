import { LIVE_STATUSES } from "./trip.js";
import { paymentNeedsRefresh } from "./paymentUi.js";

export function nextTrackingPoll(data) {
    if (data?.error) {
        if ([401, 403, 404].includes(data.status)) return null;
        return data.status === 429 ? Math.max(5000, data.retryAfterMs || 60000) : 5000;
    }
    return !data?.status || LIVE_STATUSES.includes(data.status)
        || ["payment_pending", "pending", "confirmed"].includes(data.status)
        || paymentNeedsRefresh(data) ? 5000 : null;
}

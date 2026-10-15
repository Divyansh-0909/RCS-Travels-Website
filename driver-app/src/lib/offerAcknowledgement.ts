// A failed acknowledgement can follow a committed assignment. Re-read both
// server-backed surfaces without treating the failed response as acceptance.
export async function refreshOfferAcknowledgement<T>(
    answer: () => Promise<T>,
    refreshOffers: () => Promise<unknown>,
    refreshDriver: () => Promise<unknown>,
): Promise<T> {
    try {
        return await answer();
    } finally {
        await refreshOffers().catch(() => {});
        await refreshDriver().catch(() => {});
    }
}

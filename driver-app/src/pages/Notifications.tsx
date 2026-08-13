import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import AppText from "../components/AppText";
import { OfferCard } from "../components/ui/offerCard";
import { INK_TEXT, MUTED } from "../components/ui/rideUi";
import { useOffers } from "../hooks/useOffers";

/**
 * The record of every ride currently offered to him.
 *
 * THE PANEL IS THE INTERRUPTION; THIS IS THE RECORD. A card swiped off the float
 * is still here, which is the whole reason swiping is safe — and offers are rows
 * rather than pushes precisely so that a captain who missed the notification, or
 * declined notifications altogether, still has somewhere to find his work.
 *
 * Shown to an OFFLINE captain too. The server returns his offers either way and
 * answers separately with canAccept; hiding them would mean a ride he is still
 * entitled to take simply vanishing because a switch was off.
 */
const Notifications = () => {
    const { offers, canAccept, here, loading, accept, reject } = useOffers();
    const [error, setError] = useState<string | null>(null);

    const answer = async (
        offerId: string,
        action: (id: string) => Promise<{ error?: string } | null>,
    ) => {
        const failure = await action(offerId);
        setError(failure?.error ?? null);
    };

    if (loading && offers.length === 0) {
        return (
            <View className="w-[92%] flex-1 justify-center items-center">
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <ScrollView
            className="w-[92%]"
            contentContainerStyle={{ paddingBottom: 180, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
        >
            <View className="flex-row items-baseline justify-between mb-1">
                <AppText className={`text-2xl font-bold ${INK_TEXT}`} style={{ letterSpacing: -0.6 }}>
                    Notifications
                </AppText>
                {offers.length > 0 ? (
                    <AppText className={`text-sm font-semibold ${MUTED}`}>
                        {offers.length} {offers.length === 1 ? "ride" : "rides"}
                    </AppText>
                ) : null}
            </View>

            {/* Said once, at the top, rather than as a disabled state on every
                card: the reason none of them can be taken is the same reason for
                all of them, and repeating it per ride reads as each one being
                separately unavailable. */}
            {!canAccept && offers.length > 0 ? (
                <AppText className={`text-sm ${MUTED} mb-3`}>
                    Go online to accept any of these.
                </AppText>
            ) : null}

            {error ? (
                <View className="rounded-2xl px-4 py-3 mb-3 bg-[var(--background-primary)]">
                    <AppText className="text-sm font-medium text-red-400">{error}</AppText>
                </View>
            ) : null}

            {offers.length === 0 ? (
                <View className="items-center justify-center py-16 gap-1">
                    <AppText className={`text-base font-semibold ${INK_TEXT}`}>
                        No rides offered yet
                    </AppText>
                    <AppText className={`text-sm text-center ${MUTED}`}>
                        Scheduled rides you are offered will wait here until you answer them.
                    </AppText>
                </View>
            ) : (
                <View className="gap-3">
                    {offers.map((offer) => (
                        <OfferCard
                            key={offer.offerId}
                            offer={offer}
                            here={here}
                            canAccept={canAccept}
                            onAccept={() => answer(offer.offerId, accept)}
                            onReject={() => answer(offer.offerId, reject)}
                        />
                    ))}
                </View>
            )}
        </ScrollView>
    );
};

export default Notifications;

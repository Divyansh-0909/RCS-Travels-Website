import { useState } from "react";
  import { useNavigate } from "react-router-native";
import { ScrollView, View } from "react-native";
import AppText from "../components/AppText";
import BackButton from "../components/ui/BackButton";
import { OfferCard } from "../components/ui/offerCard";
import { INK_TEXT, MUTED } from "../components/ui/rideUi";
import { useOffers } from "../hooks/useOffers";
import { OfferListSkeleton } from "../components/ui/LoadingSkeletons";

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

const TITLE_TRACKING = { letterSpacing: -0.72 };

const Notifications = () => {
    const navigate = useNavigate();
    const { offers, canAccept, here, loading, accept, reject } = useOffers();
    const [error, setError] = useState<string | null>(null);

    const answer = async (
        offerId: string,
        action: (id: string) => Promise<{ error?: string } | null>,
    ) => {
        const failure = await action(offerId);
        setError(failure?.error ?? null);
    };

    return (
        <ScrollView
            className="w-[92%] h-full"
            contentContainerStyle={{ paddingBottom: 180, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
        >
            <View className="relative">
                <View className="flex-row h-full items-baseline justify-center pt-1 gap-2 mb-1">
                    <AppText className={`text-xl font-semibold ${INK_TEXT}`} style={TITLE_TRACKING}>
                        Notifications
                    </AppText>
                    {offers.length > 0 ? (
                        <AppText className={`text-sm font-semibold ${MUTED}`}>
                            {offers.length} {offers.length === 1 ? "ride" : "rides"}
                        </AppText>
                    ) : null}
                </View>
                <BackButton
                    className="absolute -top-2 left-0 rounded-full bg-[#f3f3f3]"
                    // Notifications can be opened from any signed-in screen. Follow
                    // the same router entry as Android and swipe-back instead of
                    // hard-coding Home and discarding the captain's context.
                    onPress={() => navigate(-1)}
                    iconClassName={INK_TEXT}
                />
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

            {loading && offers.length === 0 ? (
                <OfferListSkeleton />
            ) : offers.length === 0 ? (
                <View className="items-center justify-center h-full py-16 pt-20 gap-1">
                    <AppText className={`text-base font-semibold ${INK_TEXT}`}>
                        No notifications
                    </AppText>
                    <AppText className={`text-sm text-center ${MUTED}`}>
                        Rides you are offered {"\n"} will wait here until you answer them.
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

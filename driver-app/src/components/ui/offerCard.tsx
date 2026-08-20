import { useState } from 'react';
import { View } from 'react-native';
import { cssInterop } from 'nativewind';
import type { SharedValue } from 'react-native-reanimated';
import { CheckIcon, XIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { ActionButton, FactPill, INK_TEXT, MUTED, RouteLeg, SURFACE } from './rideUi';
import { clockParts, dayBucket, formatDistance, rupees, vehicleLabel } from '../../constants/booking';
import type { Offer } from '../../hooks/useOffers';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Check = cssInterop(CheckIcon, asThemed);
const Cross = cssInterop(XIcon, asThemed);

/**
 * One offered ride, as the captain decides on it. The same card on the
 * Notifications list and inside the floating panel — a ride he half-read on the
 * float and then went looking for should be the same object when he finds it.
 */

/** Metres between two coordinates, for "how far away is the pickup". */
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * When the ride is, in the app's own words.
 *
 * scheduledAt is null for ride-now, which is the discriminator — not the
 * server's 'IMMEDIATE PICKUP' string, which is prose meant for a notification
 * body. DELIBERATELY NOT RELATIVE ("in 2 days"): constants/booking already made
 * that call for the ride list, on the grounds that a phrase is something a
 * captain has to do arithmetic on and a date is not. Two screens describing the
 * same Tuesday differently is worse than either format.
 */
const whenLabel = (scheduledAt: string | null) => {
    if (!scheduledAt) return 'NOW';
    const { clock, meridiem } = clockParts(scheduledAt);
    return `${dayBucket(new Date(scheduledAt))} • ${clock} ${meridiem}`;
};

/**
 * The things that change whether he wants the ride, as opposed to the things
 * that merely describe it. Each one costs him something he cannot see from the
 * fare: a shared cabin, a roof carrier he may not own, a day out of the city, a
 * longer road. Rendered only when true — a row of "no" chips is noise.
 */
const Chip = ({ label, strong }: { label: string; strong?: boolean }) => (
    <View
        className="rounded-xl px-2.5 py-1"
        style={{ backgroundColor: strong ? '#121220' : '#f3f3f3' }}
    >
        <AppText className={`text-sm font-semibold ${strong ? 'text-white' : INK_TEXT}`}>
            {label}
        </AppText>
    </View>
);

export const OfferCard = ({
    offer,
    here,
    canAccept,
    onAccept,
    onReject,
    timerProgress,
}: {
    offer: Offer;
    here: { lat: number; lng: number } | null;
    canAccept: boolean;
    onAccept: () => void | Promise<void>;
    onReject: () => void | Promise<void>;
    timerProgress?: SharedValue<number>;
}) => {
    // Guards a double-tap into two requests, and dims the pair while one is in
    // flight. Accept and Reject share it: answering an offer twice, either way,
    // is the same mistake.
    const [busy, setBusy] = useState(false);

    const run = async (action: () => void | Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try { await action(); } finally { setBusy(false); }
    };

    // Two different measurements. The trip length is the server's, priced at
    // booking time; how far the PICKUP is can only be answered here, against the
    // fix the location service last collected — and only once there is one.
    const toPickup = here ? kmBetween(here, offer.pickup) : null;

    return (
        <View className="w-full rounded-2xl p-4" style={{ backgroundColor: SURFACE }}>
            <View className="flex-row items-end justify-between mb-3">
                <AppText className={`text-3xl font-bold ${INK_TEXT}`} style={{ letterSpacing: -0.8 }}>
                    {rupees(offer.fare)}
                </AppText>
                <AppText className={`text-xl font-semibold ${offer.scheduledAt ? MUTED : 'text-primary'}`}>
                    {whenLabel(offer.scheduledAt)}
                </AppText>
            </View>

            <View className="flex-row flex-wrap items-center gap-2">
                <Chip label={offer.additionalPickup ? 'Additional pickup' : offer.sharing ? 'Sharing' : 'Solo'} />
                <Chip strong label={vehicleLabel(offer.vehicleClass)} />
                {offer.isOutstation ? <Chip label="Outstation" strong /> : null}
                {offer.needsCarrier ? <Chip label="Carrier" /> : null}
                {offer.safeRoute ? <Chip label="Safer route" /> : null}
            </View>

            <View className="gap-3 mt-4">
                <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                        <RouteLeg address={offer.pickup.address} />
                    </View>
                    {toPickup != null ? <FactPill>{formatDistance(toPickup)} away</FactPill> : null}
                </View>

                <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                        <RouteLeg address={offer.drop.address} drop />
                    </View>
                    {/* Nullable by design — a booking exists before its route is
                        priced — so this is a pill or nothing, never "null km". */}
                    {offer.distanceKm != null ? <FactPill>{formatDistance(offer.distanceKm)}</FactPill> : null}
                </View>
            </View>

            <View className="flex-row gap-2 mt-4" style={{ opacity: busy ? 0.5 : 1 }}>
                {/* Both flex-1, so they split the row exactly. Reject is the plain
                    fill and Accept the solid one: the pair has to read as one
                    decision with an obvious default, not two equal options. */}
                <ActionButton
                    label="Reject"
                    leading={<Cross size={18} weight="bold" className={INK_TEXT} />}
                    onPress={() => run(onReject)}
                />
                <ActionButton
                    label={canAccept ? 'Accept' : 'Go online'}
                    leading={
                        <Check
                            size={18}
                            weight="bold"
                            className="text-[var(--foreground)]"
                        />
                    }
                    onPress={() => run(onAccept)}
                    solid
                    progress={timerProgress}
                />
            </View>
        </View>
    );
};

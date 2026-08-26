import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { CaretRightIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { clockParts, rupees, splitAddress, vehicleLabel } from '../../constants/booking';
import {
    MARKETPLACE_STATUS,
    type MarketplaceListing,
} from '../../constants/marketplace';

export type { MarketplaceListing } from '../../constants/marketplace';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Caret = cssInterop(CaretRightIcon, asThemed);

const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const HAIRLINE = 'rgba(18,18,32,0.1)';

const money = (value: number) => rupees(Math.round(value));

/**
 * The marketplace equivalent of RideRow: a self-contained panel that carries only
 * what a captain scans the board by. The financial explanation belongs to the detail
 * route, so this row points right instead of folding open inside the list.
 */
const MarketplaceRow = ({
    listing,
    onPress,
}: {
    listing: MarketplaceListing;
    onPress: () => void;
}) => {
    const when = clockParts(listing.scheduledAt);
    const pickup = splitAddress(listing.pickupAddress).main;
    const drop = splitAddress(listing.dropAddress).main;
    const status = MARKETPLACE_STATUS[listing.status];

    return (
        <Pressable
            role="button"
            aria-label={`${drop} from ${pickup}. Fare ${money(listing.fare)}. ${listing.mine ? status.label : `Deposit to claim ${money(listing.deposit)}`}.`}
            onPress={onPress}
            className="w-full rounded-2xl px-4 py-3 gap-3 bg-[var(--foreground-muted)]"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
            <View className="w-full flex-row items-center gap-3">
                <View>
                    <AppText className={`font-semibold ${INK}`}>{`${when.clock} ${when.meridiem}`}</AppText>
                    <AppText className={`text-xs font-semibold uppercase tracking-wide text-center ${MUTED}`}>
                        {when.day}
                    </AppText>
                </View>

                <View className="w-px h-9" style={{ backgroundColor: HAIRLINE }} />

                <View className="flex-1">
                    <AppText numberOfLines={1} className={`font-semibold ${INK}`}>{drop}</AppText>
                    <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>from {pickup}</AppText>
                </View>

                <View className="items-end">
                    <AppText className={`font-semibold ${INK}`}>{money(listing.fare)}</AppText>
                    <AppText className={`text-xs ${MUTED}`}>{vehicleLabel(listing.vehicleClass)}</AppText>
                </View>
            </View>

            <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

            <View className="flex-row items-center justify-between gap-3">
                <View className="flex-row items-center gap-2 flex-1">
                    {listing.mine ? (
                        <View className="rounded-lg px-2.5 py-1" style={{ backgroundColor: status.fill }}>
                            <AppText className={`text-xs font-semibold uppercase tracking-wide ${status.ink}`}>
                                {status.label}
                            </AppText>
                        </View>
                    ) : null}
                    <AppText className={`text-sm ${MUTED}`}>
                        {listing.mine ? 'Deposit you set' : 'Deposit to claim'}
                    </AppText>
                    <AppText className={`text-sm font-semibold ${INK}`}>{money(listing.deposit)}</AppText>
                </View>

                <Caret size={14} weight="bold" className={MUTED} />
            </View>
        </Pressable>
    );
};

export default MarketplaceRow;

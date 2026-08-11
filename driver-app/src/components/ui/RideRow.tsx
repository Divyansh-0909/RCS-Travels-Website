import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { CaretRightIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import RideRowHead from './RideRowHead';
import { MUTED, PAGE, statusFill } from './rideUi';
import { UpcomingBooking } from '../../types/enums';
import { isFinished, paymentChip, rideStatusLabel } from '../../constants/booking';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Caret = cssInterop(CaretRightIcon, asThemed);

const HAIRLINE = 'rgba(18,18,32,0.1)';

// The money words, coloured but unboxed. The status beside them wears a solid pill, so
// the two stop reading as a matched pair — which is the point, since only one of them
// is about money. Each clears 6.3:1 on the card.
const TONES = {
    paid: 'text-[#166534]',
    due: 'text-[#92400E]',
    void: 'text-[#4B5563]',
} as const;

type Props = {
    booking: UpcomingBooking;
    onPress: () => void;
    /** History rows are filed by when they finished, not by when they were due. */
    historic?: boolean;
};

/**
 * A ride on the Rides board. It used to fold open in place; it now opens the detail
 * screen, so everything it draws is what a captain scans a list by — when, where, what
 * it pays, where it is, and what it owes. The caret points right because that is what
 * the tap does now.
 */
const RideRow = ({ booking, onPress, historic }: Props) => {
    const chip = paymentChip(booking);

    return (
        <Pressable
            role="button"
            aria-label={`${booking.user?.name ?? 'Rider'}, ${booking.dropAddress}. ${rideStatusLabel(booking.status)}. ${chip.label}.`}
            onPress={onPress}
            className="w-full rounded-2xl px-4 py-3 gap-3"
            style={{ backgroundColor: PAGE }}
        >
            <RideRowHead booking={booking} at={historic ? booking.completedAt : null} />

            <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

            <View className="flex-row items-center justify-between gap-3">
                {/* Where the ride is, then what it owes — read in that order because
                    that is the order they are decided in. */}
                <View className="flex-row items-center gap-2">
                    <View
                        className="rounded-lg px-2.5 py-1"
                        style={{ backgroundColor: statusFill(booking.status) }}
                    >
                        <AppText className="text-xs font-semibold uppercase tracking-wide text-white">
                            {rideStatusLabel(booking.status)}
                        </AppText>
                    </View>

                    {/* Only once the ride has happened. "Collect ₹900" on a job a
                        captain has not driven yet is telling him the sky is up — and
                        saying it on every upcoming row is what would stop him reading
                        it on the one finished row where it means he is owed. */}
                    {isFinished(booking) && (
                        <AppText className={`text-xs font-semibold uppercase tracking-wide ${TONES[chip.tone]}`}>
                            {chip.label}
                        </AppText>
                    )}
                </View>

                <Caret size={14} weight="bold" className={MUTED} />
            </View>
        </Pressable>
    );
};

export default RideRow;

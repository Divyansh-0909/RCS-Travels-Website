import { View } from 'react-native';
import AppText from '../AppText';
import { UpcomingBooking } from '../../types/enums';
import { clockParts, rupees, splitAddress, vehicleLabel } from '../../constants/booking';

// The one line a captain scans a list by: when, then where to, then what it pays.
// Shared verbatim by Home's Next-rides rows and the Rides page's expandable ones so
// the same ride cannot look like two different rides on two screens.
//
// Deliberately not a Pressable and deliberately without a background: both owners
// wrap it in their own, and a card inside a card is what nesting them would draw.

const HAIRLINE = 'rgba(18,18,32,0.1)';

// text-gray-600 rather than the lighter step the mock uses: 500 lands at 4.4:1 on
// #f3f3f3, under AA, and these are 12px labels read in a car in daylight.
export const MUTED = 'text-gray-600';
export const INK = 'text-[var(--background-primary)]';

type Props = {
    booking: UpcomingBooking;
    /** History rows are filed by when they finished, not by when they were due. */
    at?: string | null;
};

const RideRowHead = ({ booking, at }: Props) => {
    const stamp = at ?? booking.scheduledAt;
    const when = stamp ? clockParts(stamp) : null;
    const drop = splitAddress(booking.dropAddress).main;
    const pickup = splitAddress(booking.pickupAddress).main;

    return (
        <View className="w-full flex-row items-center gap-3">
            <View>
                {/* Clock and meridiem share one AppText rather than sitting in a
                    row: they carry the same style, so splitting them would only
                    add a wrapper and a gap to re-space what a space already does.
                    The 'Now' fallback is not a clock reading, so it takes no AM/PM. */}
                <AppText className={`font-semibold ${INK}`}>
                    {when ? `${when.clock} ${when.meridiem}` : 'Now'}
                </AppText>
                {/* Centred under a line it never matches the width of — the date
                    is the shorter of the two, so left-aligning left it hanging. */}
                <AppText className={`text-xs font-semibold uppercase tracking-wide text-center ${MUTED}`}>
                    {when?.day ?? 'Today'}
                </AppText>
            </View>

            <View className="w-px h-9" style={{ backgroundColor: HAIRLINE }} />

            <View className="flex-1">
                <AppText numberOfLines={1} className={`font-semibold ${INK}`}>{drop}</AppText>
                <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>from {pickup}</AppText>
            </View>

            <View className="items-end">
                {/* Through rupees(), not interpolated. The detail screen and the
                    earnings panel both group Indian-style, and an outstation fare is
                    five figures — so writing it raw here was the one place in the app
                    that showed ₹12000 for a number every other screen wrote ₹12,000. */}
                <AppText className={`font-semibold ${INK}`}>{rupees(booking.fare)}</AppText>
                <AppText className={`text-xs ${MUTED}`}>{vehicleLabel(booking.vehicleClass)}</AppText>
            </View>
        </View>
    );
};

export default RideRowHead;

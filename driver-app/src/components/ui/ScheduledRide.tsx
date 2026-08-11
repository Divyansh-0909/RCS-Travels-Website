import { Pressable, View } from 'react-native';
import RideRowHead from './RideRowHead';
import { UpcomingBooking } from '../../types/enums';

const CARD = '#f3f3f3';                          // --foreground-muted

type Props = {
    booking: UpcomingBooking;
    onPress?: () => void;
};

// One line per scheduled ride, on Home. The row carries only when / where / what it
// pays — everything else about the ride is a tap away, on the Rides page, where the
// same head is drawn under a fold that opens rather than navigating.
const ScheduledRide = ({ booking, onPress }: Props) => (
    // w-full as a class. It used to ride in a style function, which NativeWind drops
    // whole — the row only looked full-width because a column parent stretches its
    // children anyway, so the day the parent centred them it would have collapsed.
    <Pressable
        role="button"
        onPress={onPress}
        disabled={!onPress}
        className="w-full"
    >
        <View
            className="w-full rounded-2xl px-4 py-3"
            style={{ backgroundColor: CARD }}
        >
            <RideRowHead booking={booking} />
        </View>
    </Pressable>
);

export default ScheduledRide;

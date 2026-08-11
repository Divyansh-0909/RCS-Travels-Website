import { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { HAIRLINE, PAGE } from './rideUi';

// The Rides board while its first page is in flight.
//
// It is a TRACING of RideRow, not a generic stack of grey bars: same rounded-2xl card,
// same px-4 py-3, same gap-3, same four columns in the head and same pill-and-caret
// row under the rule. That fidelity is the whole point — a skeleton whose boxes land
// somewhere other than where the content lands makes the list jump when it arrives,
// which is worse than the spinner it replaced. If RideRow's geometry changes, this has
// to change with it.
//
// Only Rides uses this. Home draws two fixed cards and Account draws a pinned identity
// block, so neither has a list whose SHAPE is known before its content is.

// On the card's #f3f3f3, not on the page white. Low enough that six cards of it read as
// a board waiting rather than as a board full of grey rows.
const BLOCK = 'rgba(18,18,32,0.08)';

// One breath, both directions. Slow on purpose: a fast pulse reads as a progress
// indicator making promises about how long this will take, and this knows nothing
// about that.
const PULSE_MS = 900;

// Where the pulse bottoms out, and where it parks when motion is off.
const DIM = 0.4;
const STILL = 0.7;

// Three under each of two day headers. A flat run of six would be a list of six rides
// on a board that groups by day — the headers are what make this read as the Rides
// board specifically rather than as any list at all. Six fills a phone below the tabs
// without the last card being a sliver.
const GROUPS = [3, 3];

// The animated style useAnimatedStyle hands back. Not ViewStyle: it carries Reanimated's
// own internals alongside the plain properties, and typing it as a flat style is what
// forces a cast at the one call site that creates it.
type Breathe = ReturnType<typeof useAnimatedStyle>;

type BarProps = {
    width: DimensionValue;
    height: number;
    style?: ViewStyle;
    /** The shared pulse. Every bar on screen reads the same one, so the board breathes
        together instead of shimmering out of phase with itself. */
    breathe: Breathe;
};

const Bar = ({ width, height, style, breathe }: BarProps) => (
    <Animated.View
        style={[{ width, height, borderRadius: height / 2, backgroundColor: BLOCK }, style, breathe]}
    />
);

const CardSkeleton = ({ breathe }: { breathe: Breathe }) => (
    <View className="w-full rounded-2xl px-4 py-3 gap-3" style={{ backgroundColor: PAGE }}>
        {/* RideRowHead: when | rule | where to | what it pays */}
        <View className="w-full flex-row items-center gap-3">
            <View className="gap-1 items-center">
                <Bar width={62} height={15} breathe={breathe} />
                <Bar width={40} height={11} breathe={breathe} />
            </View>

            {/* The real rule, not a bar. It is chrome rather than content, so it is
                already at its final value and has nothing to wait for. */}
            <View className="w-px h-9" style={{ backgroundColor: HAIRLINE }} />

            <View className="flex-1 gap-1.5">
                <Bar width="72%" height={15} breathe={breathe} />
                <Bar width="48%" height={12} breathe={breathe} />
            </View>

            <View className="items-end gap-1.5">
                <Bar width={54} height={15} breathe={breathe} />
                <Bar width={38} height={11} breathe={breathe} />
            </View>
        </View>

        <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

        {/* The status pill, and the caret that never changes size. */}
        <View className="flex-row items-center justify-between gap-3">
            <Bar width={86} height={22} style={{ borderRadius: 8 }} breathe={breathe} />
            <Bar width={8} height={13} breathe={breathe} />
        </View>
    </View>
);

/**
 * @param withPanel History reserves the EarningsPanel's height while the total is still
 * unknown, so the rows do not shunt down the moment it lands.
 */
const RidesSkeleton = ({ withPanel = false }: { withPanel?: boolean }) => {
    // Honoured rather than assumed: a pulsing screen is exactly the kind of ambient
    // motion this setting exists to turn off, and the skeleton still does its whole job
    // held at a fixed value.
    const reduced = useReducedMotion();
    const pulse = useSharedValue(STILL);

    useEffect(() => {
        if (reduced) {
            pulse.value = STILL;
            return;
        }

        pulse.value = withRepeat(
            withTiming(DIM, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        );
    }, [pulse, reduced]);

    // Opacity only. Anything else here would be laid out on the JS thread every frame,
    // and this is on screen precisely when the JS thread is busy parsing a response.
    const breathe = useAnimatedStyle(() => ({ opacity: pulse.value }));

    return (
        // One labelled busy node for the whole board. The bars under it hold no text, so
        // a screen reader never reaches them on its own — without this it would find the
        // screen empty and say nothing at all while the request is in flight.
        //
        // overflow-hidden because this does not scroll: six cards overrun a small phone,
        // and a list that cannot be scrolled must not paint its overflow into the strip
        // the AppBar and its scrim own.
        <View
            className="flex-1 w-full gap-2 overflow-hidden"
            aria-busy
            aria-label="Loading rides"
        >
            {withPanel && (
                // The panel's own box — rounded-3xl, p-5 — drawn in the neutral rather
                // than in primary. A solid blue slab that sits there for a second and
                // then fills with a number reads as the number having been zero.
                <View className="w-full rounded-3xl p-5" style={{ backgroundColor: PAGE }}>
                    <View className="flex-row items-end justify-between gap-4">
                        <View className="flex-1 gap-2">
                            <Bar width={78} height={11} breathe={breathe} />
                            <Bar width={148} height={32} breathe={breathe} />
                        </View>
                        <View className="items-end gap-2">
                            <Bar width={34} height={26} breathe={breathe} />
                            <Bar width={58} height={11} breathe={breathe} />
                        </View>
                    </View>
                </View>
            )}

            {GROUPS.map((count, group) => (
                <View key={group} className="w-full gap-2">
                    {/* The day header, at the size and inset renderSectionHeader uses. */}
                    <Bar width={66} height={11} style={{ marginLeft: 4, marginTop: 8 }} breathe={breathe} />
                    {Array.from({ length: count }, (_, row) => (
                        <CardSkeleton key={row} breathe={breathe} />
                    ))}
                </View>
            ))}
        </View>
    );
};

export default RidesSkeleton;

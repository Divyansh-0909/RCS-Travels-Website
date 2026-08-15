import { useCallback, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { cssInterop } from 'nativewind';
import { ArrowRightIcon } from 'phosphor-react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import AppText from '../AppText';

const Arrow = cssInterop(ArrowRightIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

/**
 * Slide to confirm.
 *
 * A BUTTON WOULD BE THE WRONG CONTROL HERE. Every action this fronts is a
 * one-way door — arrived, ride started, ride finished — and each is pressed by
 * a man holding a phone in a car, often with the rider watching. A tap is one
 * accident away at the exact moments an accident costs the most: "Arrived"
 * fired early starts the rider's waiting clock, and "Complete" fired early ends
 * a ride that is still going. A deliberate gesture cannot be produced by a
 * pocket or a jolt.
 *
 * PanResponder rather than react-native-gesture-handler, which is not installed
 * and would drag in a native module and a new build for one control.
 */

const KNOB = 50;
const PAD = 6;

// `primary` from the shared tokens, as a literal for the same reason rideUi
// writes its own out: this is a style object on an Animated.View, and NativeWind
// classes do not reach one. The fill beside it uses the class.
//
// KNOB ON PRIMARY, TRACK ON PRIMARY-LIGHT, and the pairing is the point — the
// knob has to stay findable against the fill it is dragging across. A white knob
// vanished into the pale track before it moved, and a knob the same blue as the
// fill would vanish into it after.
const KNOB_FILL = '#7A94FF';
/** How far across counts as meaning it. Below this it springs back. */
const CONFIRM_AT = 0.72;

export const SlideAction = ({
    label,
    onConfirm,
    disabled,
    disabledHint,
}: {
    label: string;
    onConfirm: () => void | Promise<void>;
    disabled?: boolean;
    /** Shown in place of the label while disabled — say why, never just grey out. */
    disabledHint?: string;
}) => {
    const [width, setWidth] = useState(0);
    const x = useSharedValue(0);

    // PanResponder is built once, so everything it reaches for lives in a ref or
    // it would close over the first render's values for good.
    const state = useRef({ width: 0, disabled: false, onConfirm });
    state.current = { width, disabled: Boolean(disabled), onConfirm };

    const travel = Math.max(width - KNOB - PAD * 2, 1);

    const fire = useCallback(() => {
        const { onConfirm: run } = state.current;
        void run();
    }, []);

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !state.current.disabled,
            onMoveShouldSetPanResponder: (_, g) =>
                !state.current.disabled && Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
            onPanResponderMove: (_, g) => {
                const max = Math.max(state.current.width - KNOB - PAD * 2, 1);
                x.value = Math.min(Math.max(g.dx, 0), max);
            },
            onPanResponderRelease: (_, g) => {
                const max = Math.max(state.current.width - KNOB - PAD * 2, 1);
                const travelled = Math.min(Math.max(g.dx, 0), max);

                if (travelled / max >= CONFIRM_AT) {
                    // Run it to the end first. Confirming from wherever the thumb
                    // left off reads as the control having been interrupted.
                    x.value = withTiming(max, { duration: 120 }, (finished) => {
                        if (finished) runOnJS(fire)();
                    });
                } else {
                    x.value = withSpring(0, { damping: 20, stiffness: 200 });
                }
            },
        }),
    ).current;

    const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
    // The label fades as the knob covers it, so the track stops saying "slide to
    // do X" at the point the captain has plainly decided to.
    const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(x.value / travel, 1) }));
    // The filled part follows the knob, which is what makes the track read as a
    // progress toward the action rather than a groove with a circle in it.
    const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB }));

    return (
        <View
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            className={`w-full rounded-full overflow-hidden ${disabled ? 'opacity-50' : ''}`}
            style={{ height: KNOB + PAD * 2, backgroundColor: '#243AFB', justifyContent: 'center' }}
        >
            <Animated.View
                pointerEvents="none"
                className="absolute left-0 top-0 bottom-0 rounded-full bg-primary"
                style={fillStyle}
            />

            <Animated.View pointerEvents="none" style={labelStyle} className="absolute w-full items-center">
                <AppText className="text-base font-semibold text-[var(--foreground)]">
                    {disabled && disabledHint ? disabledHint : label}
                </AppText>
            </Animated.View>

            <Animated.View
                {...pan.panHandlers}
                style={[
                    {
                        width: KNOB,
                        height: KNOB,
                        marginLeft: PAD,
                        borderRadius: 999,
                        backgroundColor: KNOB_FILL,
                        alignItems: 'center',
                        justifyContent: 'center',
                    },
                    knobStyle,
                ]}
            >
                <Arrow size={24} weight="bold" className="text-[var(--foreground)]" />
            </Animated.View>
        </View>
    );
};

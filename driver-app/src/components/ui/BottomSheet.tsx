import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SURFACE } from './rideUi';

/**
 * The panel on the map screens, as something he can push out of the way.
 *
 * A FIXED CARD OVER A MAP IS A CARD THAT COVERS THE MAP. Everything the panel
 * says is worth a third of the screen while he is reading it and nothing at all
 * while he is looking at the road ahead of the pickup — so it drags down to a
 * peek and back up, and the map is his again in one gesture.
 *
 * DRAGGED BY THE HANDLE, NOT THE BODY, and that is a deliberate limit rather
 * than an unfinished one. The body holds a slide-to-confirm and, at `reached`, a
 * text field; a vertical responder over the whole sheet would spend its life
 * negotiating with both, and losing that negotiation once means a captain
 * dragging the sheet when he meant to confirm arrival. The handle is unambiguous
 * and it is the part of a sheet people already reach for.
 *
 * PanResponder rather than react-native-gesture-handler, which is not installed
 * and would cost a native module and a new build.
 */

/** How much of the sheet stays on screen when it is pushed down. */
const DEFAULT_PEEK = 132;

const SPRING = { damping: 22, stiffness: 220 } as const;

/** A flick beats position: past this the direction of the throw decides. */
const FLING = 0.5;

export const BottomSheet = ({
    children,
    peek = DEFAULT_PEEK,
    bottomInset = 0,
    above,
    onHeightChange,
}: {
    children: ReactNode;
    peek?: number;
    bottomInset?: number;
    above?: ReactNode;
    onHeightChange?: (height: number) => void;

}) => {
    const [height, setHeight] = useState(0);
    const y = useSharedValue(0);

    // THE INSET IS ADDED TO THE PEEK, NOT COUNTED INSIDE IT, and getting this
    // wrong is what put the handle under the tab bar. `bottomInset` is empty
    // padding at the foot of the sheet, so a peek measured against the sheet's
    // full height spends most of it on that padding and leaves the handle
    // sitting exactly where the bar floats — collapsed, the sheet could not be
    // dragged back up, because the thing you grab it by was behind the bar.
    //
    // Adding them means `peek` says what it sounds like: how much CONTENT stays
    // on screen. Whatever floats below is cleared on top of that, so any screen
    // that passes an inset gets its collapsed sheet lifted by exactly the height
    // of the thing that would have covered it.
    const visible = peek + bottomInset;

    // How far down it can go before that is all that is left. Zero until the
    // content has been measured, and zero forever if the content is shorter than
    // the peek — in which case there is nothing to collapse and the drag is inert
    // rather than jumpy.
    const hideable = Math.max(height - visible, 0);

    // PanResponder is built once. Everything it reads has to come through a ref
    // or it would close over the first render's measurement for good.
    const live = useRef({ hideable: 0 });
    live.current.hideable = hideable;
    const from = useRef(0);

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
            // Where it was when the thumb landed, so a second drag continues from
            // there instead of snapping to the finger.
            onPanResponderGrant: () => { from.current = y.value; },
            onPanResponderMove: (_, g) => {
                const max = live.current.hideable;
                y.value = Math.min(Math.max(from.current + g.dy, 0), max);
            },
            onPanResponderRelease: (_, g) => {
                const max = live.current.hideable;
                if (max <= 0) { y.value = withSpring(0, SPRING); return; }

                const target =
                    g.vy > FLING ? max
                        : g.vy < -FLING ? 0
                            : y.value > max / 2 ? max : 0;

                y.value = withSpring(target, SPRING);
            },
        }),
    ).current;

    const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

    return (
        <Animated.View
            onLayout={(e: LayoutChangeEvent) => {
                const nextHeight = e.nativeEvent.layout.height;
                setHeight(nextHeight);
                onHeightChange?.(nextHeight);
            }}
            className="absolute left-0 right-0 bottom-0 rounded-t-3xl"
            style={[slide]}
        >
            {above}
            {/* The grab area. Padded well beyond the bar itself — the bar is the
                signal, the padding is the target, and a 4px line is not something
                to ask a driver to hit. */}
            <View
                className='rounded-t-3xl'
                style={[{ backgroundColor: SURFACE }]}
            >
                <View {...pan.panHandlers} className="w-full items-center pt-3 pb-2">
                    <View className="w-10 h-1 rounded-full" style={{ backgroundColor: '#c9c9d2' }} />
                </View>

                <View style={{ paddingBottom: bottomInset }}>
                    {children}
                </View>
            </View>

        </Animated.View>
    );
};

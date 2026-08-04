/* CrossOutline — self-contained animated cross/error mark.
   Draws the two cross strokes. No external deps / network.
   Same port notes as CheckMarkOutline. */

import { useEffect } from 'react';
import Animated, {
    Easing,
    ZoomIn,
    useAnimatedProps,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Geometry for viewBox 0 0 52 52
const LINE_LENGTH = 40; // length of each cross stroke (~√((28²)+(28²)))

interface Props {
    size?: number;
    color?: string;
    strokeWidth?: number;
}

const CrossOutline = ({ size = 72, color = '#FFFFFF', strokeWidth = 6 }: Props) => {
    const first = useSharedValue(LINE_LENGTH);
    const second = useSharedValue(LINE_LENGTH);

    useEffect(() => {
        const easing = Easing.bezier(0.65, 0, 0.35, 1);
        first.value = withTiming(0, { duration: 250, easing });
        second.value = withDelay(200, withTiming(0, { duration: 250, easing }));
    }, [first, second]);

    const strokeOne = useAnimatedProps(() => ({ strokeDashoffset: first.value }));
    const strokeTwo = useAnimatedProps(() => ({ strokeDashoffset: second.value }));

    return (
        <Animated.View
            entering={ZoomIn.duration(400)}
            accessibilityRole="image"
            accessibilityLabel="Error"
        >
            <Svg width={size} height={size} viewBox="0 0 52 52" fill="none">
                <AnimatedPath
                    d="M14 14 L38 38"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={LINE_LENGTH}
                    animatedProps={strokeOne}
                />
                <AnimatedPath
                    d="M38 14 L14 38"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={LINE_LENGTH}
                    animatedProps={strokeTwo}
                />
            </Svg>
        </Animated.View>
    );
};

export default CrossOutline;

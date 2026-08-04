/* CheckMarkOutline — self-contained animated success checkmark.
   Draws the check stroke. No external deps / network.

   The website does this with @keyframes on stroke-dashoffset. RN has no CSS
   animation, so the draw runs on a shared value and the pop is an entering
   animation. Reanimated already respects the OS reduce-motion setting, which
   is what the web version's media query is for. */

import { useEffect } from 'react';
import Animated, {
    Easing,
    ZoomIn,
    useAnimatedProps,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Geometry for viewBox 0 0 52 52
const CHECK_LENGTH = 48;   // length of the check path

interface Props {
    size?: number;
    color?: string;
    strokeWidth?: number;
}

const CheckMarkOutline = ({ size = 72, color = '#FFFFFF', strokeWidth = 6 }: Props) => {
    const offset = useSharedValue(CHECK_LENGTH);

    useEffect(() => {
        offset.value = withTiming(0, {
            duration: 350,
            easing: Easing.bezier(0.65, 0, 0.35, 1),
        });
    }, [offset]);

    const stroke = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

    return (
        <Animated.View
            entering={ZoomIn.duration(400)}
            accessibilityRole="image"
            accessibilityLabel="Success"
        >
            <Svg width={size} height={size} viewBox="0 0 52 52" fill="none">
                <AnimatedPath
                    d="M12 28 L23 39 L40 15"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={CHECK_LENGTH}
                    animatedProps={stroke}
                />
            </Svg>
        </Animated.View>
    );
};

export default CheckMarkOutline;

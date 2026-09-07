import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { useEffect, useState, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useColorScheme,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const BLOCK = 'rgba(18,18,32,0.08)';
const STILL_OPACITY = 0.72;
const DIM_OPACITY = 0.42;
export const DARK_MAP_LAND_COLOR = '#2e2e38';
export const LIGHT_MAP_LAND_COLOR = '#b9b9bf';

type SectionProps = {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One independently pulsing loading section. Keeping the animation on the
 * section rather than on every placeholder avoids starting dozens of native
 * animations while the JS thread is already processing a response.
 */
export const SkeletonSection = ({ children, className, style }: SectionProps) => {
    useCopyLanguage();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(STILL_OPACITY);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = STILL_OPACITY;
      return;
    }

    opacity.value = withRepeat(
      withTiming(DIM_OPACITY, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true,
      undefined,
      ReduceMotion.System,
    );

    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const breathe = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      aria-hidden
      className={className}
      style={[style, breathe]}
    >
      {children}
    </Animated.View>
  );
};

export const SkeletonBlock = ({
  width = '100%',
  height,
  radius,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) => (
  <View
    style={[
      {
        width,
        height,
        borderRadius: radius ?? Math.min(height / 2, 12),
        backgroundColor: BLOCK,
      },
      style,
    ]}
  />
);

/** A plain map-coloured field with one soft highlight sweeping across it. */
export const MapLoadingSkeleton = ({ dark }: { dark?: boolean }) => {
    useCopyLanguage();
  const systemScheme = useColorScheme();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const isDark = dark ?? systemScheme === 'dark';

  useEffect(() => {
    if (reducedMotion || width <= 0) {
      cancelAnimation(translateX);
      translateX.value = 0;
      return;
    }

    const timing = {
      easing: Easing.inOut(Easing.quad),
      reduceMotion: ReduceMotion.System,
    } as const;

    // Begin with the highlight already entering the screen. Native map tiles
    // often load before a full skeleton cycle could travel in from off-screen.
    translateX.value = -width * 0.35;
    translateX.value = withSequence(
      withTiming(width, {
        ...timing,
        duration: 1100,
      }),
      withTiming(-width, { ...timing, duration: 0 }),
      withRepeat(withTiming(width, {
        ...timing,
        duration: 1600,
      }), -1, false, undefined, ReduceMotion.System),
    );

    return () => cancelAnimation(translateX);
  }, [reducedMotion, translateX, width]);

  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityLabel={dc("Loading map")}
      accessibilityState={{ busy: true }}
      exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        overflow: 'hidden',
        backgroundColor: isDark ? DARK_MAP_LAND_COLOR : LIGHT_MAP_LAND_COLOR,
      }}
    >
      {!reducedMotion && width > 0 ? (
        <Animated.View style={[{ position: 'absolute', inset: 0 }, sheen]}>
          <LinearGradient
            colors={[
              'rgba(255,255,255,0)',
              isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.70)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0.36, 0.5, 0.64]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
};

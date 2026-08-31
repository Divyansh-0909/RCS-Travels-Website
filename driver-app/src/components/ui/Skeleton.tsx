import { useEffect, type ReactNode } from 'react';
import {
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
  withTiming,
} from 'react-native-reanimated';

const BLOCK = 'rgba(18,18,32,0.08)';
const MAP_BLOCK = 'rgba(255,255,255,0.52)';
const STILL_OPACITY = 0.72;
const DIM_OPACITY = 0.42;

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
  map = false,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  map?: boolean;
  style?: StyleProp<ViewStyle>;
}) => (
  <View
    style={[
      {
        width,
        height,
        borderRadius: radius ?? Math.min(height / 2, 12),
        backgroundColor: map ? MAP_BLOCK : BLOCK,
      },
      style,
    ]}
  />
);

/** The map is one section, so its skeleton covers only the map surface. */
export const MapLoadingSkeleton = ({ dark = false }: { dark?: boolean }) => (
  <Animated.View
    pointerEvents="none"
    accessible
    accessibilityLabel="Loading map"
    accessibilityState={{ busy: true }}
    exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 20,
      overflow: 'hidden',
      backgroundColor: dark ? '#2e2e38' : '#b9b9bf',
    }}
  >
    <SkeletonSection style={{ flex: 1 }}>
      {/* Broad, quiet route shapes make this read as the map region without
          pretending to know the eventual streets or pin positions. */}
      <SkeletonBlock
        map
        width="130%"
        height={18}
        radius={9}
        style={{ position: 'absolute', top: '24%', left: '-18%', transform: [{ rotate: '-13deg' }] }}
      />
      <SkeletonBlock
        map
        width="118%"
        height={12}
        radius={6}
        style={{ position: 'absolute', top: '56%', left: '-4%', transform: [{ rotate: '18deg' }] }}
      />
      <SkeletonBlock
        map
        width="82%"
        height={8}
        radius={4}
        style={{ position: 'absolute', top: '76%', left: '-8%', transform: [{ rotate: '-28deg' }] }}
      />
      <SkeletonBlock
        map
        width={54}
        height={54}
        radius={27}
        style={{ position: 'absolute', top: '43%', left: '43%' }}
      />
    </SkeletonSection>
  </Animated.View>
);

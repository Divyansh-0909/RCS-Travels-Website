import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fonts } from '../theme/fonts';
import { useTheme } from '../theme/ThemeContext';

type StartupSplashProps = {
  appReady: boolean;
  themeReady: boolean;
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const StartupSplash = ({ appReady, themeReady }: StartupSplashProps) => {
  const { colors, scheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const phase = useSharedValue(0);
  const opacity = useSharedValue(1);

  const phaseTwoBackground = scheme === 'light' ? colors.surface : colors.immersive;

  useEffect(() => {
    if (!themeReady) return;

    phase.set(withTiming(1, {
      duration: reducedMotion ? 120 : 260,
      easing: EASE_OUT,
    }));
  }, [phase, reducedMotion, themeReady]);

  useEffect(() => {
    if (!appReady) return;

    opacity.set(withDelay(
      reducedMotion ? 180 : 420,
      withTiming(0, {
        duration: reducedMotion ? 120 : 180,
        easing: EASE_OUT,
      }, (finished) => {
        if (finished) scheduleOnRN(setVisible, false);
      }),
    ));
  }, [appReady, opacity, reducedMotion]);

  const surfaceStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      phase.get(),
      [0, 1],
      [colors.primary, phaseTwoBackground],
    ),
    opacity: opacity.get(),
  }));

  const brandStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      phase.get(),
      [0, 1],
      [colors.onStrong, colors.ink],
    ),
  }));

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityViewIsModal
      pointerEvents="auto"
      style={[StyleSheet.absoluteFillObject, styles.root, surfaceStyle]}
    >
      <StatusBar
        animated
        style={themeReady && scheme === 'light' ? 'dark' : 'light'}
      />
      <Animated.Text style={[styles.brand, brandStyle]}>RCS Captains</Animated.Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  brand: {
    fontFamily: fonts.semibold,
    fontSize: 32,
    letterSpacing: -1.2,
  },
});

export default StartupSplash;

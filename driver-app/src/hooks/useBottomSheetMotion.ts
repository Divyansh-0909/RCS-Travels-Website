import { useCallback, useEffect, useState } from 'react';
import {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Keeps a bottom-sheet Modal mounted long enough for its close motion to finish.
 * Motion is limited to transform + opacity and follows the same timings as the
 * document-source sheet already used by the captain registration flow.
 */
export const useBottomSheetMotion = (visible: boolean, hiddenY: number) => {
  const [mounted, setMounted] = useState(visible);
  const scrimOpacity = useSharedValue(visible ? 1 : 0);
  const sheetY = useSharedValue(visible ? 0 : hiddenY);
  const unmount = useCallback(() => setMounted(false), []);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.get() }] }));

  useEffect(() => {
    cancelAnimation(scrimOpacity);
    cancelAnimation(sheetY);

    if (visible) {
      if (!mounted) {
        scrimOpacity.set(0);
        sheetY.set(hiddenY);
        setMounted(true);
      }

      scrimOpacity.set(withTiming(1, {
        duration: 180,
        easing: EASE_OUT,
        reduceMotion: ReduceMotion.System,
      }));
      sheetY.set(withTiming(0, {
        duration: 240,
        easing: EASE_OUT,
        reduceMotion: ReduceMotion.System,
      }));
      return;
    }

    if (!mounted) return;

    scrimOpacity.set(withTiming(0, {
      duration: 160,
      easing: EASE_OUT,
      reduceMotion: ReduceMotion.System,
    }));
    sheetY.set(withTiming(hiddenY, {
      duration: 220,
      easing: EASE_OUT,
      reduceMotion: ReduceMotion.System,
    }, (finished) => {
      if (finished) scheduleOnRN(unmount);
    }));
  }, [hiddenY, mounted, scrimOpacity, sheetY, unmount, visible]);

  return { mounted, scrimStyle, sheetStyle };
};


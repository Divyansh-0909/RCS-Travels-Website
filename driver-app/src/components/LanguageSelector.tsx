import { useEffect, useState } from 'react';
import { driverCopy as dc } from "../lib/copy";
import { Pressable, View } from 'react-native';
import { CheckCircleIcon, CircleIcon } from 'phosphor-react-native';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AppText from './AppText';
import { useTheme } from '../theme/ThemeContext';
import type { DriverLanguage } from '../types/language';

export type { DriverLanguage } from '../types/language';

type Option = {
  id: DriverLanguage;
  name: string;
  prompt: string;
  native: string;
};

const options: Option[] = [
  { id: 'en', name: 'English', prompt: 'Can read this? Tap here', native: 'English' },
  { id: 'hi-Latn', name: 'Hinglish', prompt: 'Ye padh sakte hain? Yahan dabayein', native: 'Hinglish' },
  { id: 'hi', name: 'Hindi', prompt: 'यह पढ़ सकते हैं? यहाँ दबाएँ', native: 'हिंदी' },
];

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const SELECTION_DURATION = 170;

const LanguageOption = ({ option, selected, onSelect, compact, light }: {
  option: Option;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
  light: boolean;
}) => {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState(false);
  const selection = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selection.set(withTiming(selected ? 1 : 0, {
      duration: SELECTION_DURATION,
      easing: EASE_OUT,
      reduceMotion: ReduceMotion.System,
    }));
  }, [selected, selection]);

  const selectionStyle = useAnimatedStyle(() => {
    const progress = selection.get();
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        [light ? colors.surfaceRaised : 'rgba(255,255,255,0.04)', 'rgba(36,58,251,0.10)'],
      ),
      borderColor: interpolateColor(progress, [0, 1], [colors.borderUi, colors.primary]),
    };
  }, [colors.borderUi, colors.primary, colors.surfaceRaised, light]);

  return (
    <Animated.View style={[selectionStyle, { opacity: pressed ? 0.72 : 1 }]} className={`w-full rounded-2xl border ${compact ? 'py-3' : 'py-4'}`}>
      <Pressable
        role="radio"
        aria-checked={selected}
        accessibilityLabel={dc("{{value0}}. {{value1}}", {value0: option.native, value1: option.prompt})}
        onPress={onSelect}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        className="px-4"
      >
        <View className="flex-row items-center gap-3">
          <View className="mt-0.5">
            {selected
              ? <Animated.View entering={FadeIn.duration(SELECTION_DURATION).easing(EASE_OUT).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(SELECTION_DURATION).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}><CheckCircleIcon size={22} weight="fill" color={colors.primaryLight} /></Animated.View>
              : <Animated.View entering={FadeIn.duration(SELECTION_DURATION).easing(EASE_OUT).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(SELECTION_DURATION).easing(EASE_OUT).reduceMotion(ReduceMotion.System)}><CircleIcon size={22} color={colors.inkMuted} /></Animated.View>}
          </View>
          <View className="flex-1">
            <AppText className="text-base font-semibold text-ink">{option.native}</AppText>
            <AppText className="text-sm leading-6 text-ink-muted">{option.prompt}</AppText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

type Props = {
  value?: DriverLanguage;
  onSelect: (language: DriverLanguage) => void;
  compact?: boolean;
  light?: boolean;
};

/**
 * The decision is phrased in the language it represents. It lets a captain
 * choose before the app assumes he can read its current language.
 */
const LanguageSelector = ({ value, onSelect, compact = false, light = false }: Props) => {
  return (
  <View className={compact ? 'w-full gap-2' : 'w-full gap-3'}>
    {options.map((option) => {
      const selected = value === option.id;
      return (
        <LanguageOption
          key={option.id}
          option={option}
          selected={selected}
          onSelect={() => onSelect(option.id)}
          compact={compact}
          light={light}
        />
      );
    })}
  </View>
  );
};

export default LanguageSelector;

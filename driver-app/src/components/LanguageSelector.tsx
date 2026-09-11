import { useState } from 'react';
import { driverCopy as dc } from "../lib/copy";
import { Pressable, View } from 'react-native';
import { CheckCircleIcon, CircleIcon } from 'phosphor-react-native';
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
  const [pressedId, setPressedId] = useState<DriverLanguage | null>(null);
  const { colors } = useTheme();
  return (
  <View className={compact ? 'w-full gap-2' : 'w-full gap-3'}>
    {options.map((option) => {
      const selected = value === option.id;
      return (
        <Pressable
          key={option.id}
          role="radio"
          aria-checked={selected}
          accessibilityLabel={dc("{{value0}}. {{value1}}", {value0: (option.name), value1: (option.prompt)})}
          onPress={() => onSelect(option.id)}
          className={`w-full rounded-2xl border px-4 ${compact ? 'py-3' : 'py-4'}`}
          onPressIn={() => setPressedId(option.id)}
          onPressOut={() => setPressedId(null)}
          style={{
            borderColor: selected ? colors.primary : colors.borderUi,
            backgroundColor: selected ? 'rgba(36,58,251,0.10)' : light ? colors.surfaceRaised : 'rgba(255,255,255,0.04)',
            opacity: pressedId === option.id ? 0.72 : 1,
          }}
        >
          <View className="flex-row items-center gap-3">
            <View className="mt-0.5">
              {selected
                ? <CheckCircleIcon size={22} weight="fill" color={colors.primaryLight} />
                : <CircleIcon size={22} color={colors.inkMuted} />}
            </View>
            <View className="flex-1">
              <AppText className="text-base font-semibold text-ink">{option.name}</AppText>
              <AppText className="text-sm leading-6 text-ink-muted">{option.prompt}</AppText>
            </View>
          </View>
        </Pressable>
      );
    })}
  </View>
  );
};

export default LanguageSelector;

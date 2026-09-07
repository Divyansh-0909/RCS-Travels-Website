import { useState } from 'react';
import { driverCopy as dc } from "../lib/copy";
import { Pressable, View } from 'react-native';
import { CheckCircleIcon, TranslateIcon } from 'phosphor-react-native';
import AppText from './AppText';

export type DriverLanguage = 'en' | 'hi-Latn' | 'hi';

type Option = {
  id: DriverLanguage;
  name: string;
  prompt: string;
  native: string;
};

const options: Option[] = [
  { id: 'en', name: 'English', prompt: 'CanRead this? Tap here', native: 'English' },
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
            borderColor: selected ? '#243AFB' : light ? 'rgba(18,18,32,0.16)' : 'rgba(255,255,255,0.28)',
            backgroundColor: selected ? 'rgba(36,58,251,0.10)' : light ? 'rgba(18,18,32,0.04)' : 'rgba(255,255,255,0.04)',
            opacity: pressedId === option.id ? 0.72 : 1,
          }}
        >
          <View className="flex-row items-start gap-3">
            <View className="mt-0.5">
              {selected
                ? <CheckCircleIcon size={22} weight="fill" color="#7A94FF" />
                : <TranslateIcon size={22} weight="regular" color={light ? '#4B5563' : '#AEAEAE'} />}
            </View>
            <View className="flex-1 gap-1">
              <View className="flex-row items-baseline justify-between gap-3">
                <AppText className={`text-base font-semibold ${light ? 'text-[var(--background-primary)]' : 'text-[var(--text)]'}`}>{option.name}</AppText>
                <AppText className={`text-sm ${light ? 'text-gray-600' : 'text-[var(--text-muted)]'}`}>{option.native}</AppText>
              </View>
              <AppText className={`text-sm leading-6 ${light ? 'text-gray-600' : 'text-[var(--text-muted)]'}`}>{option.prompt}</AppText>
            </View>
          </View>
        </Pressable>
      );
    })}
  </View>
  );
};

export default LanguageSelector;

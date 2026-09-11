import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { MapPinIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { useLanguage } from '../../i18n';
import { driverCopy as dc } from '../../lib/copy';
import { useTheme } from '../../theme/ThemeContext';
import type NativeMapSlot from './MapSlot';

// react-native-maps supports native platforms. Keep its native module out of
// the browser bundle so onboarding and account screens can render on web.
export default function MapSlot(_props: ComponentProps<typeof NativeMapSlot>) {
  useLanguage();
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-[var(--background)] px-8">
      <MapPinIcon size={32} color={colors.primaryLight} />
      <AppText className="text-center text-base leading-6 text-ink-muted">
        {dc('Open the captain app to view the live map.')}
      </AppText>
    </View>
  );
}

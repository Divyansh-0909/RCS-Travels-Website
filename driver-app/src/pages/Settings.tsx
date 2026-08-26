import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BellIcon, CaretRightIcon, GlobeIcon, MoonIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountDetailScreen, {
  ACCOUNT_HAIRLINE,
  ACCOUNT_MUTED,
  AccountSection,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';

type Permission = 'checking' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

const SettingRow = ({
  label,
  detail,
  Icon,
  onPress,
  last,
}: {
  label: string;
  detail: string;
  Icon: typeof BellIcon;
  onPress?: () => void;
  last?: boolean;
}) => {
  const body = (
    <View className="flex-row items-center gap-3 py-3.5">
      <View className="w-9 h-9 rounded-xl items-center justify-center bg-white">
        <Icon size={18} weight="regular" color="#121220" />
      </View>
      <View className="flex-1">
        <AppText className="font-semibold text-[var(--background-primary)]">{label}</AppText>
        <AppText className={`text-sm ${ACCOUNT_MUTED}`}>{detail}</AppText>
      </View>
      {onPress ? <CaretRightIcon size={16} weight="bold" color="#4B5563" /> : null}
    </View>
  );

  return (
    <View style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: ACCOUNT_HAIRLINE }}>
      {onPress ? (
        <Pressable role="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          {body}
        </Pressable>
      ) : body}
    </View>
  );
};

const Settings = () => {
  const [permission, setPermission] = useState<Permission>('checking');

  const refreshPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermission('unavailable');
      return;
    }
    const result = await Notifications.getPermissionsAsync();
    setPermission(result.status as Permission);
  }, []);

  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const manageNotifications = useCallback(async () => {
    if (permission === 'undetermined') {
      const result = await Notifications.requestPermissionsAsync();
      setPermission(result.status as Permission);
      return;
    }
    if (Platform.OS !== 'web') await Linking.openSettings();
  }, [permission]);

  const notificationDetail = permission === 'granted' ? 'Allowed on this device'
    : permission === 'denied' ? 'Blocked in device settings'
      : permission === 'undetermined' ? 'Tap to allow ride alerts'
        : permission === 'unavailable' ? 'Managed by your browser'
          : 'Checking permission…';

  return (
    <AccountDetailScreen title="Settings">
      <AccountSectionLabel>App preferences</AccountSectionLabel>
      <AccountSection>
        <SettingRow
          label="Notifications"
          detail={notificationDetail}
          Icon={BellIcon}
          onPress={permission === 'checking' || permission === 'unavailable' ? undefined : manageNotifications}
        />
        <SettingRow label="Language" detail="English" Icon={GlobeIcon} />
        <SettingRow label="Appearance" detail="Follows your device" Icon={MoonIcon} last />
      </AccountSection>

      <View className="mx-4 mt-2">
        <AppText className={`text-sm ${ACCOUNT_MUTED}`}>
          Ride alerts use your device notification permission. Language selection will
          appear here when translated captain screens are ready.
        </AppText>
      </View>
    </AccountDetailScreen>
  );
};

export default Settings;

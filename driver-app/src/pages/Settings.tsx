import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BellIcon, GlobeIcon, MoonIcon } from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';

type Permission = 'checking' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

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
      <AccountList>
        <AccountRow
          label="Notifications"
          detail={notificationDetail}
          Icon={BellIcon}
          onPress={permission === 'checking' || permission === 'unavailable' ? undefined : manageNotifications}
        />
        <AccountRow label="Language" value="English" Icon={GlobeIcon} />
        <AccountRow label="Appearance" value="Device" Icon={MoonIcon} last />
      </AccountList>
    </AccountDetailScreen>
  );
};

export default Settings;

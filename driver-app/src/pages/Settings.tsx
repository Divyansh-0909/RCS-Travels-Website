import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BellIcon, GlobeIcon, MoonIcon } from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import LanguageSelector from '../components/LanguageSelector';
import AppText from '../components/AppText';
import { useLanguage } from '../i18n';

type Permission = 'checking' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

const Settings = () => {
  const [permission, setPermission] = useState<Permission>('checking');
  const [choosingLanguage, setChoosingLanguage] = useState(false);
  const { language, setLanguage, t } = useLanguage();

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

  const notificationDetail = permission === 'granted' ? t('driver.settings.allowed')
    : permission === 'denied' ? t('driver.settings.blocked')
      : permission === 'undetermined' ? t('driver.settings.allow')
        : permission === 'unavailable' ? t('driver.settings.browser')
          : t('driver.settings.checking');

  const languageName = language === 'hi' ? t('common.language.hindi')
    : language === 'hi-Latn' ? t('common.language.hinglish') : t('common.language.english');

  return (
    <AccountDetailScreen title={t('driver.settings.title')}>
      <AccountSectionLabel>{t('driver.settings.preferences')}</AccountSectionLabel>
      <AccountList>
        <AccountRow
          label={t('driver.settings.notifications')}
          detail={notificationDetail}
          Icon={BellIcon}
          onPress={permission === 'checking' || permission === 'unavailable' ? undefined : manageNotifications}
        />
        <AccountRow label={t('driver.settings.language')} value={languageName} Icon={GlobeIcon} onPress={() => setChoosingLanguage((open) => !open)} />
        {choosingLanguage ? (
          <View className="py-3">
            <AppText className="text-sm text-gray-600 mb-3">{t('driver.language.body')}</AppText>
            <LanguageSelector value={language} light compact onSelect={async (next) => { try { await setLanguage(next); } finally { setChoosingLanguage(false); } }} />
          </View>
        ) : null}
        <AccountRow label={t('driver.settings.appearance')} value={t('driver.settings.device')} Icon={MoonIcon} last={!choosingLanguage} />
      </AccountList>
    </AccountDetailScreen>
  );
};

export default Settings;

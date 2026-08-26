import { Linking, View } from 'react-native';
import { ChatCircleIcon, EnvelopeIcon, PhoneIcon, WarningCircleIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import Button from '../components/ui/Button';
import AccountDetailScreen, {
  ACCOUNT_MUTED,
  AccountSection,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import {
  callSupport,
  openSupportWhatsApp,
  supportEmail,
  supportPhoneDisplay,
} from '../constants/support';

const Help = () => (
  <AccountDetailScreen title="Help">
    <AccountSection>
      <AppText className="font-semibold text-[var(--background-primary)]">RCS Support</AppText>
      <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
        For account, document, payout or ride questions, tell us what happened and
        include the ride reference when you have one.
      </AppText>
    </AccountSection>

    <AccountSectionLabel>Contact us</AccountSectionLabel>
    <AccountSection>
      <View className="flex-row items-center gap-3 mb-3">
        <ChatCircleIcon size={20} weight="regular" color="#121220" />
        <View className="flex-1">
          <AppText className="font-semibold text-[var(--background-primary)]">WhatsApp</AppText>
          <AppText className={`text-sm ${ACCOUNT_MUTED}`}>Usually the quickest way to get help</AppText>
        </View>
      </View>
      <Button onPress={() => openSupportWhatsApp('Hi, I need help with my captain account.')}>
        Message support
      </Button>

      <View className="flex-row items-center gap-3 mt-4 mb-2">
        <PhoneIcon size={20} weight="regular" color="#121220" />
        <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>{supportPhoneDisplay()}</AppText>
      </View>
      <Button prop={{ variant: 'secondary' }} onPress={callSupport}>Call support</Button>

      <View className="flex-row items-center gap-3 mt-4 mb-2">
        <EnvelopeIcon size={20} weight="regular" color="#121220" />
        <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>{supportEmail()}</AppText>
      </View>
      <Button
        prop={{ variant: 'secondary' }}
        onPress={() => Linking.openURL(`mailto:${supportEmail()}?subject=Captain%20support`)}
      >
        Email support
      </Button>
    </AccountSection>

    <AccountSectionLabel>Emergency</AccountSectionLabel>
    <AccountSection>
      <View className="flex-row items-start gap-3">
        <WarningCircleIcon size={20} weight="regular" color="#B91C1C" />
        <View className="flex-1">
          <AppText className="font-semibold text-[var(--background-primary)]">Danger right now?</AppText>
          <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
            Call 112 first. Support can help with the ride record after you are safe.
          </AppText>
        </View>
      </View>
      <View className="mt-3">
        <Button prop={{ variant: 'negative' }} onPress={() => Linking.openURL('tel:112')}>
          Call 112
        </Button>
      </View>
    </AccountSection>
  </AccountDetailScreen>
);

export default Help;

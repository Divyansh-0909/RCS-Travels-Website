import { View } from 'react-native';
import { BankIcon, ShieldCheckIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import Button from '../components/ui/Button';
import AccountDetailScreen, {
  ACCOUNT_MUTED,
  AccountSection,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import { openSupportWhatsApp } from '../constants/support';

const PayoutAccount = () => (
  <AccountDetailScreen title="UPI account">
    <AccountSection>
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-xl items-center justify-center bg-white">
          <BankIcon size={20} weight="regular" color="#121220" />
        </View>
        <View className="flex-1">
          <AppText className="font-semibold text-[var(--background-primary)]">
            No UPI account linked
          </AppText>
          <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
            In-app payout setup is not available yet. Your wallet balance stays on
            your RCS captain account until a settlement is arranged.
          </AppText>
        </View>
      </View>
    </AccountSection>

    <AccountSectionLabel>Before you link an account</AccountSectionLabel>
    <AccountSection>
      <View className="flex-row items-start gap-3">
        <ShieldCheckIcon size={20} weight="regular" color="#121220" />
        <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>
          Support will verify that the UPI name belongs to you. Never send your UPI
          PIN, OTP, card number or banking password to anyone.
        </AppText>
      </View>
    </AccountSection>

    <View className="mx-4 mt-2">
      <Button
        onPress={() => openSupportWhatsApp('Hi, I want to link or update the UPI account for my captain payouts.')}
      >
        Contact support
      </Button>
    </View>
  </AccountDetailScreen>
);

export default PayoutAccount;

import { View } from 'react-native';
import { BankIcon, ShieldCheckIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  ACCOUNT_MUTED,
  AccountList,
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

    <AccountSectionLabel>Payout setup</AccountSectionLabel>
    <AccountList>
      <AccountRow
        label="Link or update UPI account"
        detail="Handled securely with RCS Support"
        value="Not linked"
        Icon={BankIcon}
        caret={false}
        onPress={() => openSupportWhatsApp('Hi, I want to link or update the UPI account for my captain payouts.')}
        last
      />
    </AccountList>

    <AccountSectionLabel>Keep your account safe</AccountSectionLabel>
    <AccountSection>
      <View className="flex-row items-start gap-3">
        <View className="w-9 h-9 rounded-xl items-center justify-center bg-white">
          <ShieldCheckIcon size={18} weight="regular" color="#121220" />
        </View>
        <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>
          Support verifies that the UPI name belongs to you. Never share your UPI PIN,
          OTP, card number or banking password.
        </AppText>
      </View>
    </AccountSection>
  </AccountDetailScreen>
);

export default PayoutAccount;

import { driverCopy as dc } from "../lib/copy";
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
  <AccountDetailScreen title={dc("UPI account")}>
    <AccountSection>
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-xl items-center justify-center bg-white">
          <BankIcon size={20} weight="regular" color="#121220" />
        </View>
        <View className="flex-1">
          <AppText className="font-semibold text-[var(--background-primary)]">{dc("No UPI account linked")}</AppText>
          <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>{dc("In-app payout setup is not available yet. Your wallet balance stays on your RCS captain account until a settlement is arranged.")}</AppText>
        </View>
      </View>
    </AccountSection>

    <AccountSectionLabel>{dc("Payout setup")}</AccountSectionLabel>
    <AccountList>
      <AccountRow
        label={dc("Link or update UPI account")}
        detail={dc("Handled securely with RCS Support")}
        value={dc("Not linked")}
        Icon={BankIcon}
        caret={false}
        onPress={() => openSupportWhatsApp(dc("Hi, I want to link or update the UPI account for my captain payouts."))}
        last
      />
    </AccountList>

    <AccountSectionLabel>{dc("Keep your account safe")}</AccountSectionLabel>
    <AccountSection>
      <View className="flex-row items-start gap-3">
        <View className="w-9 h-9 rounded-xl items-center justify-center bg-white">
          <ShieldCheckIcon size={18} weight="regular" color="#121220" />
        </View>
        <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>{dc("Support verifies that the UPI name belongs to you. Never share your UPI PIN, OTP, card number or banking password.")}</AppText>
      </View>
    </AccountSection>
  </AccountDetailScreen>
);

export default PayoutAccount;

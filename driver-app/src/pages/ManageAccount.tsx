import { View } from 'react-native';
import { PhoneIcon, UserIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import Button from '../components/ui/Button';
import AccountDetailScreen, {
  ACCOUNT_HAIRLINE,
  ACCOUNT_MUTED,
  AccountSection,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import { formatPhone, verificationLabel } from '../constants/driver';
import { openSupportWhatsApp } from '../constants/support';
import { useDriver } from '../hooks/useDriver';

const Fact = ({ label, value, last }: { label: string; value: string; last?: boolean }) => (
  <View
    className="py-3"
    style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: ACCOUNT_HAIRLINE }}
  >
    <AppText className={`text-xs ${ACCOUNT_MUTED}`}>{label}</AppText>
    <AppText className="font-semibold mt-0.5 text-[var(--background-primary)]">{value}</AppText>
  </View>
);

const ManageAccount = () => {
  const { profile } = useDriver();

  return (
    <AccountDetailScreen title="Manage account">
      <AccountSection>
        <View className="flex-row items-start gap-3">
          <View className="w-10 h-10 rounded-xl items-center justify-center bg-white">
            <UserIcon size={20} weight="regular" color="#121220" />
          </View>
          <View className="flex-1">
            <AppText className="font-semibold text-[var(--background-primary)]">
              Your captain profile
            </AppText>
            <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
              These details are used for verification and shown to riders only when
              they have a ride assigned to you.
            </AppText>
          </View>
        </View>
      </AccountSection>

      <AccountSectionLabel>Account details</AccountSectionLabel>
      <View
        className="mx-4 rounded-2xl px-4 bg-white"
        style={{ borderWidth: 1, borderColor: ACCOUNT_HAIRLINE }}
      >
        <Fact label="Name" value={profile?.name ?? 'Not available'} />
        <Fact label="Phone" value={profile ? formatPhone(profile.phone) : 'Not available'} />
        <Fact label="Current car" value={profile?.vehicleNumber ?? 'No car added'} />
        <Fact label="Account status" value={profile ? verificationLabel(profile.verificationStatus) : 'Not available'} last />
      </View>

      <AccountSectionLabel>Changes and account closure</AccountSectionLabel>
      <AccountSection>
        <View className="flex-row items-start gap-3">
          <PhoneIcon size={20} weight="regular" color="#121220" />
          <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>
            Verified identity details cannot be changed directly in the app. Support
            will check any correction or account-closure request before applying it.
          </AppText>
        </View>
      </AccountSection>

      <View className="mx-4 mt-2">
        <Button onPress={() => openSupportWhatsApp('Hi, I need to update the details on my captain account.')}>
          Ask to update details
        </Button>
        <Button
          prop={{ variant: 'secondary' }}
          onPress={() => openSupportWhatsApp('Hi, I want to request closure of my RCS captain account. Please tell me what is required.')}
        >
          Request account closure
        </Button>
      </View>
    </AccountDetailScreen>
  );
};

export default ManageAccount;

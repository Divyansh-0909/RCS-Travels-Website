import { Linking, Pressable, View } from 'react-native';
import { ArrowSquareOutIcon, FileTextIcon, ShieldCheckIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountDetailScreen, {
  ACCOUNT_HAIRLINE,
  ACCOUNT_MUTED,
  AccountSection,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';

const BASE = 'https://www.rcstravels.co.in';

const documents = [
  { label: 'Terms of service', detail: 'Rules for using RCS Travels', path: '/terms', Icon: FileTextIcon },
  { label: 'Privacy policy', detail: 'How account and ride data is handled', path: '/privacy', Icon: ShieldCheckIcon },
  { label: 'Refunds & cancellation', detail: 'When charges are kept or returned', path: '/refunds', Icon: FileTextIcon },
  { label: 'Grievance redressal', detail: 'How to make and escalate a complaint', path: '/grievance', Icon: ShieldCheckIcon },
] as const;

const Legal = () => (
  <AccountDetailScreen title="Legal">
    <AccountSection>
      <AppText className="font-semibold text-[var(--background-primary)]">RCS Travels documents</AppText>
      <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
        These open on the RCS Travels website so you always read the latest published copy.
      </AppText>
    </AccountSection>

    <AccountSectionLabel>Documents</AccountSectionLabel>
    <View
      className="mx-4 rounded-2xl px-4 bg-white"
      style={{ borderWidth: 1, borderColor: ACCOUNT_HAIRLINE }}
    >
      {documents.map(({ label, detail, path, Icon }, index) => (
        <View
          key={path}
          style={index === documents.length - 1 ? undefined : {
            borderBottomWidth: 1,
            borderBottomColor: ACCOUNT_HAIRLINE,
          }}
        >
          <Pressable
            role="link"
            aria-label={`${label}, opens website`}
            onPress={() => Linking.openURL(`${BASE}${path}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <View className="flex-row items-center gap-3 py-3.5">
              <View className="w-9 h-9 rounded-xl items-center justify-center bg-[var(--foreground-muted)]">
                <Icon size={18} weight="regular" color="#121220" />
              </View>
              <View className="flex-1">
                <AppText className="font-semibold text-[var(--background-primary)]">{label}</AppText>
                <AppText className={`text-sm ${ACCOUNT_MUTED}`}>{detail}</AppText>
              </View>
              <ArrowSquareOutIcon size={17} weight="bold" color="#4B5563" />
            </View>
          </Pressable>
        </View>
      ))}
    </View>
  </AccountDetailScreen>
);

export default Legal;

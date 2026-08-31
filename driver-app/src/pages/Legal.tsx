import { Linking } from 'react-native';
import { FileTextIcon, ShieldCheckIcon } from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
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
    <AccountSectionLabel>RCS Travels documents</AccountSectionLabel>
    <AccountList>
      {documents.map(({ label, detail, path, Icon }, index) => (
        <AccountRow
          key={path}
          label={label}
          detail={detail}
          Icon={Icon}
          external
          onPress={() => Linking.openURL(`${BASE}${path}`)}
          last={index === documents.length - 1}
        />
      ))}
    </AccountList>
  </AccountDetailScreen>
);

export default Legal;

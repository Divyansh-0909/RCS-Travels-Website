import { driverCopy as dc } from "../lib/copy";
import { FileTextIcon, ShieldCheckIcon } from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import { openExternalUrl } from '../lib/externalLinks';

const BASE = 'https://www.rcstravels.co.in';

const documents = [
  { get "label"() { return dc("Terms of service"); }, get "detail"() { return dc("Rules for using RCS Travels"); }, path: '/terms', Icon: FileTextIcon },
  { get "label"() { return dc("Privacy policy"); }, get "detail"() { return dc("How account and ride data is handled"); }, path: '/privacy', Icon: ShieldCheckIcon },
  { get "label"() { return dc("Refunds & cancellation"); }, get "detail"() { return dc("When charges are kept or returned"); }, path: '/refunds', Icon: FileTextIcon },
  { get "label"() { return dc("Grievance redressal"); }, get "detail"() { return dc("How to make and escalate a complaint"); }, path: '/grievance', Icon: ShieldCheckIcon },
] as const;

const Legal = () => (
  <AccountDetailScreen title={dc("Legal")}>
    <AccountSectionLabel>{dc("RCS Travels documents")}</AccountSectionLabel>
    <AccountList>
      {documents.map(({ label, detail, path, Icon }, index) => (
        <AccountRow
          key={path}
          label={label}
          detail={detail}
          Icon={Icon}
          external
          onPress={() => openExternalUrl(`${BASE}${path}`)}
          last={index === documents.length - 1}
        />
      ))}
    </AccountList>
  </AccountDetailScreen>
);

export default Legal;

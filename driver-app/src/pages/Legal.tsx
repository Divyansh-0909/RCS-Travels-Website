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
  { get "label"() { return dc("Terms of service"); }, get "detail"() { return dc("Rules for driver-partners"); }, path: '/driver-terms', Icon: FileTextIcon },
  { get "label"() { return dc("Privacy policy"); }, get "detail"() { return dc("How driver, vehicle and location data is handled"); }, path: '/driver-privacy', Icon: ShieldCheckIcon },
  { get "label"() { return dc("Payments & cancellation"); }, get "detail"() { return dc("Scheduled ride payment and cancellation rules"); }, path: '/driver-payments', Icon: FileTextIcon },
  { get "label"() { return dc("Grievance redressal"); }, get "detail"() { return dc("How to make and escalate a driver concern"); }, path: '/driver-grievance', Icon: ShieldCheckIcon },
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

import { driverCopy as dc } from "../lib/copy";
import { ChatCircleIcon, EnvelopeIcon, PhoneIcon, WarningCircleIcon } from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import {
  callSupport,
  openSupportWhatsApp,
  supportEmail,
  supportPhoneDisplay,
} from '../constants/support';
import { callPhoneNumber, openExternalUrl } from '../lib/externalLinks';

const Help = () => (
  <AccountDetailScreen title={dc("Help")}>
    <AccountSectionLabel>{dc("RCS support")}</AccountSectionLabel>
    <AccountList>
      <AccountRow
        label={dc("Message on WhatsApp")}
        detail={dc("Usually the quickest way to get help")}
        Icon={ChatCircleIcon}
        caret={false}
        onPress={() => openSupportWhatsApp(dc("Hi, I need help with my captain account."))}
      />
      <AccountRow
        label={dc("Call support")}
        value={supportPhoneDisplay()}
        Icon={PhoneIcon}
        caret={false}
        onPress={callSupport}
      />
      <AccountRow
        label={dc("Email support")}
        detail={supportEmail()}
        Icon={EnvelopeIcon}
        caret={false}
        onPress={() => openExternalUrl(
          `mailto:${supportEmail()}?subject=Captain%20support`,
          dc("Could not open the email app. Please try again."),
        )}
        last
      />
    </AccountList>

    <AccountSectionLabel>{dc("Emergency")}</AccountSectionLabel>
    <AccountList>
      <AccountRow
        label={dc("Call 112")}
        detail={dc("If you are in immediate danger, call emergency services first")}
        Icon={WarningCircleIcon}
        tone="danger"
        caret={false}
        onPress={() => callPhoneNumber('112')}
        last
      />
    </AccountList>
  </AccountDetailScreen>
);

export default Help;

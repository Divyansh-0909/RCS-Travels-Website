import { Linking } from 'react-native';
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

const Help = () => (
  <AccountDetailScreen title="Help">
    <AccountSectionLabel>RCS support</AccountSectionLabel>
    <AccountList>
      <AccountRow
        label="Message on WhatsApp"
        detail="Usually the quickest way to get help"
        Icon={ChatCircleIcon}
        caret={false}
        onPress={() => openSupportWhatsApp('Hi, I need help with my captain account.')}
      />
      <AccountRow
        label="Call support"
        value={supportPhoneDisplay()}
        Icon={PhoneIcon}
        caret={false}
        onPress={callSupport}
      />
      <AccountRow
        label="Email support"
        detail={supportEmail()}
        Icon={EnvelopeIcon}
        caret={false}
        onPress={() => Linking.openURL(`mailto:${supportEmail()}?subject=Captain%20support`)}
        last
      />
    </AccountList>

    <AccountSectionLabel>Emergency</AccountSectionLabel>
    <AccountList>
      <AccountRow
        label="Call 112"
        detail="If you are in immediate danger, call emergency services first"
        Icon={WarningCircleIcon}
        tone="danger"
        caret={false}
        onPress={() => Linking.openURL('tel:112')}
        last
      />
    </AccountList>
  </AccountDetailScreen>
);

export default Help;

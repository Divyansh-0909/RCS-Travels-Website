import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
import {
  CarIcon,
  PencilSimpleIcon,
  PhoneIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserIcon,
} from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import { formatPhone, verificationLabel } from '../constants/driver';
import { openSupportWhatsApp } from '../constants/support';
import { useDriver } from '../hooks/useDriver';

type ManageAccountViewProps = {
  name: string;
  phone: string;
  currentCar: string;
  status: string;
};

export const ManageAccountView = ({ name, phone, currentCar, status }: ManageAccountViewProps) => {
    useCopyLanguage();
  return (
    <AccountDetailScreen title={dc("Manage account")}>
      <AccountSectionLabel>{dc("Captain profile")}</AccountSectionLabel>
      <AccountList>
        <AccountRow label={dc("Name")} detail={name} Icon={UserIcon} />
        <AccountRow label={dc("Phone")} detail={phone} Icon={PhoneIcon} />
        <AccountRow label={dc("Current car")} detail={currentCar} Icon={CarIcon} />
        <AccountRow label={dc("Account status")} detail={status} Icon={ShieldCheckIcon} last />
      </AccountList>

      <AccountSectionLabel>{dc("Account support")}</AccountSectionLabel>
      <AccountList>
        <AccountRow
          label={dc("Update profile details")}
          detail={dc("Verified changes are reviewed by RCS Support")}
          Icon={PencilSimpleIcon}
          caret={false}
          onPress={() => openSupportWhatsApp(dc("Hi, I need to update the details on my captain account."))}
        />
        <AccountRow
          label={dc("Request account closure")}
          detail={dc("Support will confirm your request before closing the account")}
          Icon={TrashIcon}
          tone="danger"
          caret={false}
          onPress={() => openSupportWhatsApp(dc("Hi, I want to request closure of my RCS captain account. Please tell me what is required."))}
          last
        />
      </AccountList>
    </AccountDetailScreen>
  );
};

const ManageAccount = () => {
    useCopyLanguage();
  const { profile } = useDriver();

  return (
    <ManageAccountView
      name={profile?.name ?? dc("Not available")}
      phone={profile ? formatPhone(profile.phone) : dc("Not available")}
      currentCar={profile?.vehicleNumber ?? dc("No car added")}
      status={profile ? verificationLabel(profile.verificationStatus) : dc("Not available")}
    />
  );
};

export default ManageAccount;

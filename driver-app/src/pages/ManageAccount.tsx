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
  return (
    <AccountDetailScreen title="Manage account">
      <AccountSectionLabel>Captain profile</AccountSectionLabel>
      <AccountList>
        <AccountRow label="Name" detail={name} Icon={UserIcon} />
        <AccountRow label="Phone" detail={phone} Icon={PhoneIcon} />
        <AccountRow label="Current car" detail={currentCar} Icon={CarIcon} />
        <AccountRow label="Account status" detail={status} Icon={ShieldCheckIcon} last />
      </AccountList>

      <AccountSectionLabel>Account support</AccountSectionLabel>
      <AccountList>
        <AccountRow
          label="Update profile details"
          detail="Verified changes are reviewed by RCS Support"
          Icon={PencilSimpleIcon}
          caret={false}
          onPress={() => openSupportWhatsApp('Hi, I need to update the details on my captain account.')}
        />
        <AccountRow
          label="Request account closure"
          detail="Support will confirm your request before closing the account"
          Icon={TrashIcon}
          tone="danger"
          caret={false}
          onPress={() => openSupportWhatsApp('Hi, I want to request closure of my RCS captain account. Please tell me what is required.')}
          last
        />
      </AccountList>
    </AccountDetailScreen>
  );
};

const ManageAccount = () => {
  const { profile } = useDriver();

  return (
    <ManageAccountView
      name={profile?.name ?? 'Not available'}
      phone={profile ? formatPhone(profile.phone) : 'Not available'}
      currentCar={profile?.vehicleNumber ?? 'No car added'}
      status={profile ? verificationLabel(profile.verificationStatus) : 'Not available'}
    />
  );
};

export default ManageAccount;

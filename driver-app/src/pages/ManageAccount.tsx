import { useState } from 'react';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
import {
  PencilSimpleIcon,
  PhoneIcon,
  TrashIcon,
  UserIcon,
} from 'phosphor-react-native';
import AccountRow from '../components/ui/AccountRow';
import AccountDetailScreen, {
  AccountList,
  AccountSectionLabel,
} from '../components/ui/AccountDetailScreen';
import DeleteAccountSheet from '../components/ui/DeleteAccountSheet';
import { ManageAccountSkeleton } from '../components/ui/LoadingSkeletons';
import { formatPhone } from '../constants/driver';
import { openSupportWhatsApp } from '../constants/support';
import { useApi } from '../hooks/useApi';
import { useDriver } from '../hooks/useDriver';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ASYNC_CONTENT_ENTER = FadeInDown
  .duration(190)
  .easing(EASE_OUT)
  .reduceMotion(ReduceMotion.System)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] });

type ManageAccountViewProps = {
  name: string;
  phone: string;
  onDeleteAccount?: () => void;
};

export const ManageAccountView = ({ name, phone, onDeleteAccount }: ManageAccountViewProps) => {
    useCopyLanguage();
  return (
    <AccountDetailScreen title={dc("Manage account")} centeredHeader>
      <AccountSectionLabel>{dc("Captain profile")}</AccountSectionLabel>
      <AccountList>
        <AccountRow label={dc("Name")} detail={name} Icon={UserIcon} grouped />
        <AccountRow label={dc("Phone")} detail={phone} Icon={PhoneIcon} grouped last />
      </AccountList>

      <AccountSectionLabel>{dc("Account support")}</AccountSectionLabel>
      <AccountList>
        <AccountRow
          label={dc("Update profile details")}
          detail={dc("Verified changes are reviewed by RCS Support")}
          Icon={PencilSimpleIcon}
          caret={false}
          grouped
          onPress={() => openSupportWhatsApp(dc("Hi, I need to update the details on my captain account."))}
        />
        <AccountRow
          label={dc("Delete account")}
          Icon={TrashIcon}
          tone="danger"
          caret={false}
          grouped
          onPress={onDeleteAccount}
          last
        />
      </AccountList>
    </AccountDetailScreen>
  );
};

const ManageAccount = () => {
    useCopyLanguage();
  const { profile, loading } = useDriver();
  const api = useApi();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDelete = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);

    const result = await api.deleteMe();
    if (result?.error) {
      setDeleting(false);
      setDeleteError(
        result.code === 'ACTIVE_RIDE' || result.status === 409
          ? dc('Finish your active ride before deleting your account.')
          : dc('Could not delete your account. Please try again.')
      );
      return;
    }

    try {
      await api.logout();
    } catch {
      // The server has already deleted the Clerk user, so a local sign-out can
      // race with that removal. The auth provider will settle signed-out anyway.
    }
  };

  if (loading && !profile) {
    return (
      <AccountDetailScreen title={dc("Manage account")} centeredHeader>
        <ManageAccountSkeleton />
      </AccountDetailScreen>
    );
  }

  return (
    <>
      <Animated.View entering={ASYNC_CONTENT_ENTER} style={{ flex: 1, width: '100%' }}>
        <ManageAccountView
          name={profile?.name ?? dc("Not available")}
          phone={profile ? formatPhone(profile.phone) : dc("Not available")}
          onDeleteAccount={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        />
      </Animated.View>
      <DeleteAccountSheet
        visible={deleteOpen}
        busy={deleting}
        error={deleteError}
        onCancel={closeDelete}
        onConfirm={confirmDelete}
      />
    </>
  );
};

export default ManageAccount;

import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { BankIcon, CheckCircleIcon, LinkIcon, ShieldCheckIcon, XIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountDetailScreen, { ACCOUNT_MUTED } from '../components/ui/AccountDetailScreen';
import Button from '../components/ui/Button';
import InlineError from '../components/ui/InlineError';
import Input from '../components/ui/Input';
import { useBottomSheetMotion } from '../hooks/useBottomSheetMotion';
import { useApi } from '../hooks/useApi';
import { sheetSurfaceStyle } from '../components/ui/sheetSurfaceStyle';
import { driverCopy as dc } from '../lib/copy';
import { useTheme } from '../theme/ThemeContext';

const SCRIM = 'rgba(18,18,32,0.45)';
const WELL = 'rgba(18,18,32,0.04)';
const ERROR_TEXT = '#B91C1C';

const normalizeUpiId = (value: string) => value.trim().replace(/\s+/g, '');

const validUpiId = (value: string) => {
  const normalized = normalizeUpiId(value);
  const separator = normalized.indexOf('@');
  return separator > 0
    && separator === normalized.lastIndexOf('@')
    && separator < normalized.length - 1
    && normalized.length <= 100;
};

const PayoutAccount = () => {
  const { colors } = useTheme();
  const api = useApi();
  const { height: windowHeight } = useWindowDimensions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [savedUpiId, setSavedUpiId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [closePressed, setClosePressed] = useState(false);
  const [linkPressed, setLinkPressed] = useState(false);
  const { mounted: sheetMounted, scrimStyle, sheetStyle } = useBottomSheetMotion(
    sheetOpen,
    Math.max(windowHeight * 0.55, 420),
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    api.getWallet().then((result) => {
      if (!active) return;
      if (result.error) setServerError(result.error);
      else {
        const account = result.payoutAccount;
        setSavedUpiId(account?.upiId ?? null);
        setUpiId(account?.upiId ?? '');
        setVerified(Boolean(account?.verified));
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [api]);

  const upiError = useMemo(() => {
    if (!submitted) return null;
    if (!normalizeUpiId(upiId)) return dc('Enter your UPI ID.');
    if (!validUpiId(upiId)) return dc('Enter a valid UPI ID, for example name@bank.');
    return null;
  }, [submitted, upiId]);

  const openSheet = () => {
    setSubmitted(false);
    setServerError(null);
    setUpiId(savedUpiId ?? '');
    setSheetOpen(true);
  };

  const closeSheet = () => {
    Keyboard.dismiss();
    setSheetOpen(false);
    setSubmitted(false);
  };

  const saveAccount = async () => {
    setSubmitted(true);
    if (!validUpiId(upiId)) return;

    const normalized = normalizeUpiId(upiId);
    setSaving(true);
    setServerError(null);
    const result = await api.savePayoutAccount(normalized);
    setSaving(false);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSavedUpiId(result.upiId);
    setUpiId(result.upiId);
    setVerified(Boolean(result.verified));
    closeSheet();
  };

  return (
    <>
      <AccountDetailScreen title={dc('UPI account')} centeredHeader>
        <View className="mx-4">
          {savedUpiId && (
            <View className="mb-3 rounded-3xl bg-surface-muted px-5 py-5 flex-row items-center gap-4">
              <View className="w-10 h-10 items-center justify-center">
                {verified
                  ? <CheckCircleIcon size={27} weight="fill" color="#15803D" />
                  : <BankIcon size={27} weight="fill" color={colors.ink} />}
              </View>
              <View className="flex-1">
                <AppText className="text-lg font-semibold text-ink">{savedUpiId}</AppText>
                <AppText className={`text-sm mt-1 ${verified ? 'text-[#15803D]' : ACCOUNT_MUTED}`}>
                  {verified ? dc('Verified for payouts') : dc('Saved · waiting for RCS verification')}
                </AppText>
              </View>
            </View>
          )}
          <Pressable
            role="button"
            onPress={openSheet}
            onPressIn={() => setLinkPressed(true)}
            onPressOut={() => setLinkPressed(false)}
            className="rounded-3xl px-5 py-5 flex-row items-center gap-4"
            style={{
              backgroundColor: colors.surfaceMuted,
              opacity: linkPressed ? 0.68 : 1,
            }}
          >
            <View className="w-10 h-10 items-center justify-center">
              <LinkIcon size={26} weight="regular" color={colors.ink} />
            </View>
            <View className="flex-1">
                <AppText className="text-lg font-semibold text-ink">{savedUpiId ? dc('Change UPI account') : dc('Link UPI account')}</AppText>
                <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
                  {savedUpiId ? dc('Changing it requires verification again.') : dc('Add a UPI ID for captain payouts.')}
                </AppText>
            </View>
          </Pressable>
        </View>

        <View className="mx-4 mt-2 px-1 flex-row items-start gap-2.5">
          <ShieldCheckIcon size={18} weight="regular" color={colors.inkMuted} />
          <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>
            {dc('RCS verifies payout details before money can be sent. Never share your UPI PIN or OTP.')}
          </AppText>
        </View>
        {loading && <AppText className={`mx-5 mt-2 text-sm ${ACCOUNT_MUTED}`}>{dc('Loading payout account…')}</AppText>}
        {!sheetOpen && serverError && <InlineError message={serverError} color={ERROR_TEXT} />}
      </AccountDetailScreen>

      <Modal
        visible={sheetMounted}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <View className="flex-1 justify-end" style={{ paddingBottom: keyboardHeight }}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM }, scrimStyle]}
          />
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSheet} />
          <Animated.View style={sheetStyle}>
            <Pressable
            accessibilityViewIsModal
            className="bg-surface rounded-t-3xl px-5 pt-5"
            style={[sheetSurfaceStyle, { maxHeight: Math.max(windowHeight - keyboardHeight - 16, 260) }]}
            onPress={() => {}}
            >
            <View className="flex-row items-start gap-3 pb-4">
              <View className="flex-1 gap-1">
                <AppText className="text-lg font-semibold text-ink">{dc('Link UPI account')}</AppText>
                <AppText className={`text-sm ${ACCOUNT_MUTED}`}>
                  {dc('Enter the UPI ID you want to receive captain payouts on. RCS will verify it before it is used.')}
                </AppText>
              </View>
              <Pressable
                role="button"
                aria-label={dc('Close')}
                hitSlop={10}
                onPress={closeSheet}
                onPressIn={() => setClosePressed(true)}
                onPressOut={() => setClosePressed(false)}
                className="rounded-full items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: WELL,
                  opacity: closePressed ? 0.6 : 1,
                }}
              >
                <XIcon size={16} weight="bold" color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
            >
              <View className="gap-1">
                <AppText className="text-sm font-semibold text-ink">{dc('UPI ID')}</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'email',
                    placeholder: dc('name@bank'),
                    value: upiId,
                    error: Boolean(upiError),
                    autoComplete: 'off',
                    maxLength: 100,
                    onChangeFn: (value) => {
                      setUpiId(value);
                      if (submitted) setSubmitted(false);
                      if (serverError) setServerError(null);
                    },
                  }}
                />
                <InlineError message={upiError} color={ERROR_TEXT} />
                <InlineError message={serverError} color={ERROR_TEXT} />
              </View>

              <Button prop={{ disabled: saving }} onPress={saveAccount}>{saving ? dc('Saving…') : dc('Save UPI ID')}</Button>

              <View className="flex-row items-start gap-2.5 px-1">
                <ShieldCheckIcon size={17} weight="regular" color={colors.inkMuted} />
                <AppText className={`flex-1 text-xs ${ACCOUNT_MUTED}`}>
                  {dc('Saving a new UPI ID removes its verified status until an admin verifies it again. No UPI PIN or OTP is needed.')}
                </AppText>
              </View>
            </ScrollView>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

export default PayoutAccount;

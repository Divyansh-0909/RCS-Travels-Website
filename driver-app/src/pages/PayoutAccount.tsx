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
import { BankIcon, ShieldCheckIcon, XIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import AccountDetailScreen, { ACCOUNT_MUTED } from '../components/ui/AccountDetailScreen';
import Button from '../components/ui/Button';
import InlineError from '../components/ui/InlineError';
import Input from '../components/ui/Input';
import { openSupportWhatsApp } from '../constants/support';
import { useBottomSheetMotion } from '../hooks/useBottomSheetMotion';
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
  const { height: windowHeight } = useWindowDimensions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [upiId, setUpiId] = useState('');
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

  const upiError = useMemo(() => {
    if (!submitted) return null;
    if (!normalizeUpiId(upiId)) return dc('Enter your UPI ID.');
    if (!validUpiId(upiId)) return dc('Enter a valid UPI ID, for example name@bank.');
    return null;
  }, [submitted, upiId]);

  const openSheet = () => {
    setSubmitted(false);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    Keyboard.dismiss();
    setSheetOpen(false);
    setSubmitted(false);
  };

  const continueWithSupport = () => {
    setSubmitted(true);
    if (!validUpiId(upiId)) return;

    const normalized = normalizeUpiId(upiId);
    closeSheet();
    openSupportWhatsApp(
      dc('Hi, I want to link this UPI ID for my captain payouts: {{value0}}', { value0: normalized }),
    );
  };

  return (
    <>
      <AccountDetailScreen title={dc('UPI account')} centeredHeader>
        <View className="mx-4">
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
              <BankIcon size={26} weight="regular" color={colors.ink} />
            </View>
            <View className="flex-1">
              <AppText className="text-lg font-semibold text-ink">{dc('Link UPI account')}</AppText>
              <AppText className={`text-sm mt-1 ${ACCOUNT_MUTED}`}>
                {dc('Add a UPI ID for captain payouts.')}
              </AppText>
            </View>
          </Pressable>
        </View>

        <View className="mx-4 mt-2 px-1 flex-row items-start gap-2.5">
          <ShieldCheckIcon size={18} weight="regular" color={colors.inkMuted} />
          <AppText className={`flex-1 text-sm ${ACCOUNT_MUTED}`}>
            {dc('RCS Support verifies payout details. Never share your UPI PIN or OTP.')}
          </AppText>
        </View>
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
            style={{ maxHeight: Math.max(windowHeight - keyboardHeight - 16, 260) }}
            onPress={() => {}}
            >
            <View className="flex-row items-start gap-3 pb-4">
              <View className="flex-1 gap-1">
                <AppText className="text-lg font-semibold text-ink">{dc('Link UPI account')}</AppText>
                <AppText className={`text-sm ${ACCOUNT_MUTED}`}>
                  {dc('Enter the UPI ID you want to receive captain payouts on. RCS Support will verify it before it is used.')}
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
                    },
                  }}
                />
                <InlineError message={upiError} color={ERROR_TEXT} />
              </View>

              <Button onPress={continueWithSupport}>{dc('Continue with support')}</Button>

              <View className="flex-row items-start gap-2.5 px-1">
                <ShieldCheckIcon size={17} weight="regular" color={colors.inkMuted} />
                <AppText className={`flex-1 text-xs ${ACCOUNT_MUTED}`}>
                  {dc('You will continue in WhatsApp so the RCS team can verify the payout account. No UPI PIN or OTP is needed.')}
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

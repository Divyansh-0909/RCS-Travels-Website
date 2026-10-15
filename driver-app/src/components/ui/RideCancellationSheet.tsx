import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { XIcon } from 'phosphor-react-native';
import { useLanguage as useCopyLanguage } from '../../i18n';
import { useBottomSheetMotion } from '../../hooks/useBottomSheetMotion';
import { driverCopy as dc } from '../../lib/copy';
import { useTheme } from '../../theme/ThemeContext';
import AppText from '../AppText';
import Button from './Button';
import { sheetSurfaceStyle } from './sheetSurfaceStyle';

const SCRIM = 'rgba(18,18,32,0.45)';
const SELECTED_WELL = 'rgba(36,58,251,0.08)';
const DANGER_WELL = 'rgba(185,28,28,0.08)';
const DISABLED_WELL = 'rgba(18,18,32,0.03)';
const NO_SHOW_WAIT_MS = 30 * 60 * 1000;
const OTHER_MAX_LENGTH = 300;

export type DriverCancellationReason =
  | 'rider_requested_cancel'
  | 'rider_unreachable'
  | 'rider_no_show_30m'
  | 'road_or_vehicle_issue'
  | 'rider_threatening'
  | 'rider_abusive'
  | 'carrier_not_requested'
  | 'other';

type ReasonOption = {
  value: DriverCancellationReason;
  label: string;
  note?: string;
};

const REASONS: ReasonOption[] = [
  { value: 'rider_requested_cancel', label: 'Rider asked me to cancel' },
  { value: 'rider_unreachable', label: 'Rider cannot be contacted' },
  { value: 'rider_no_show_30m', label: 'Rider did not arrive at pickup' },
  { value: 'road_or_vehicle_issue', label: 'Road closure, breakdown or accident' },
  { value: 'rider_threatening', label: 'Rider is threatening or violent' },
  { value: 'rider_abusive', label: 'Rider is verbally abusive or harassing' },
  { value: 'carrier_not_requested', label: 'Rider needs a carrier but did not request one' },
  { value: 'other', label: 'Other', note: 'Tell us what happened.' },
];

type Props = {
  visible: boolean;
  busy: boolean;
  error?: string | null;
  reachedAt?: string | null;
  onClose: () => void;
  onConfirm: (reason: DriverCancellationReason, otherReason?: string) => void;
};

const RideCancellationSheet = ({
  visible,
  busy,
  error,
  reachedAt,
  onClose,
  onConfirm,
}: Props) => {
  useCopyLanguage();
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [selected, setSelected] = useState<DriverCancellationReason | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [now, setNow] = useState(Date.now());
  const reasonsScrollRef = useRef<ScrollView>(null);
  const { mounted, scrimStyle, sheetStyle } = useBottomSheetMotion(
    visible,
    Math.max(windowHeight * 0.9, 680),
  );

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setOtherReason('');
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [visible]);

  const noShowEligibility = useMemo(() => {
    if (!reachedAt) {
      return {
        enabled: false,
        note: dc('Available after you mark arrival and wait 30 minutes.'),
      };
    }
    const reached = new Date(reachedAt).getTime();
    const remainingMs = reached + NO_SHOW_WAIT_MS - now;
    if (!Number.isFinite(reached) || remainingMs > 0) {
      const minutes = Number.isFinite(reached)
        ? Math.max(1, Math.ceil(remainingMs / 60_000))
        : 30;
      return {
        enabled: false,
        note: dc('{{value0}} min remaining before this reason is available.', { value0: String(minutes) }),
      };
    }
    return { enabled: true, note: dc('30-minute wait completed.') };
  }, [now, reachedAt]);

  const trimmedOtherReason = otherReason.trim();
  const canConfirm = Boolean(
    selected
    && (selected !== 'other' || trimmedOtherReason.length >= 3)
    && !busy,
  );

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM }, scrimStyle]}
        />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={close} />

        <Animated.View style={sheetStyle}>
          <View
            className="rounded-t-3xl bg-surface px-5 pt-3 pb-8"
            style={sheetSurfaceStyle}
          >
            <View className="items-center pb-3">
              <View
                className="h-1 w-10 rounded-full"
                style={{ backgroundColor: colors.borderUi }}
              />
            </View>

            <View className="flex-row items-start gap-3 pb-4">
              <View className="flex-1 gap-1">
                <AppText className="text-xl font-semibold text-ink" style={{ letterSpacing: -0.5 }}>
                  {dc('Why are you cancelling?')}
                </AppText>
                <AppText className="text-sm leading-snug text-ink-muted">
                  {dc('Choose the reason that best matches what happened. It will be saved with this ride.')}
                </AppText>
              </View>
              <Pressable
                role="button"
                aria-label={dc('Close')}
                hitSlop={10}
                disabled={busy}
                onPress={close}
                className="h-9 w-9 items-center justify-center rounded-full bg-surface-raised"
                style={({ pressed }) => ({ opacity: busy ? 0.35 : pressed ? 0.6 : 1 })}
              >
                <XIcon size={17} weight="bold" color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView
              ref={reasonsScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: Math.min(windowHeight * 0.56, 500) }}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {REASONS.map((option) => {
                const isNoShow = option.value === 'rider_no_show_30m';
                const disabled = busy || (isNoShow && !noShowEligibility.enabled);
                const isSelected = selected === option.value;
                const note = isNoShow ? noShowEligibility.note : option.note;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled }}
                    disabled={disabled}
                    onPress={() => setSelected(option.value)}
                    className="min-h-[58px] flex-row items-center gap-3 rounded-2xl px-4 py-3"
                    style={({ pressed }) => ({
                      backgroundColor: isSelected ? SELECTED_WELL : disabled ? DISABLED_WELL : colors.surfaceRaised,
                      borderColor: isSelected ? colors.primary : 'transparent',
                      borderWidth: 1,
                      opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      className="h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{
                        borderWidth: 2,
                        borderColor: isSelected ? colors.primary : colors.borderUi,
                      }}
                    >
                      {isSelected ? (
                        <View
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: colors.primary }}
                        />
                      ) : null}
                    </View>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <AppText className="text-sm font-semibold text-ink">{dc(option.label)}</AppText>
                      {note ? (
                        <AppText className="text-xs leading-snug text-ink-muted">{dc(note)}</AppText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {selected === 'other' ? (
                <View
                  className="gap-1.5 pt-1"
                  onLayout={() => reasonsScrollRef.current?.scrollToEnd({ animated: true })}
                >
                  <AppText className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {dc('What happened?')}
                  </AppText>
                  <TextInput
                    value={otherReason}
                    onChangeText={setOtherReason}
                    editable={!busy}
                    multiline
                    maxLength={OTHER_MAX_LENGTH}
                    textAlignVertical="top"
                    placeholder={dc('Add a short explanation')}
                    className="min-h-[96px] rounded-2xl border px-4 py-3 text-base text-ink"
                    style={{ borderColor: colors.borderUi, backgroundColor: colors.surfaceRaised, color: colors.ink }}
                  />
                  <AppText className="text-right text-xs text-ink-muted">
                    {trimmedOtherReason.length}/{OTHER_MAX_LENGTH}
                  </AppText>
                </View>
              ) : null}
            </ScrollView>

            {error ? (
              <View className="mt-3 rounded-2xl px-4 py-3" style={{ backgroundColor: DANGER_WELL }}>
                <AppText className="text-sm text-[#B91C1C]">{error}</AppText>
              </View>
            ) : null}

            <View className="mt-4 gap-2">
              <Button
                prop={{ variant: 'negative', disabled: !canConfirm }}
                onPress={() => {
                  if (!selected || !canConfirm) return;
                  onConfirm(selected, selected === 'other' ? trimmedOtherReason : undefined);
                }}
              >
                {busy ? dc('Cancelling…') : dc('Cancel ride')}
              </Button>
              <Button prop={{ variant: 'secondary', disabled: busy }} onPress={close}>
                {dc('Keep ride')}
              </Button>
            </View>

          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default RideCancellationSheet;

import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { XIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { rupees, vehicleLabel } from '../../constants/booking';
import {
  MARKETPLACE_POSTER_FEE_RATE,
  type MarketplaceListing,
} from '../../constants/marketplace';
import Button from './Button';
import DateTimeSelector, {
  getDefaultScheduledAt,
  MARKETPLACE_MAX_AHEAD_DAYS,
  MARKETPLACE_MIN_LEAD_MS,
} from './DateTimeSelector';
import Input from './Input';
import LocationAutocompleteInput from './LocationAutocompleteInput';
import { useTheme } from '../../theme/ThemeContext';

const HAIRLINE = 'rgba(18,18,32,0.12)';
const SCRIM = 'rgba(18,18,32,0.52)';
const WELL = 'rgba(18,18,32,0.04)';
const ERROR = '#B91C1C';

const SHEET_TOP_GAP = 16;

const INK = 'text-ink';
const MUTED = 'text-ink-muted';

const VEHICLE_CLASSES = ['hatchback', 'sedan', 'suv', 'suv_premium'] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (listing: MarketplaceListing) => void;
};

type Form = {
  pickup: string;
  drop: string;
  riderName: string;
  riderPhone: string;
  vehicleClass: string;
  preferSafeRoute: boolean;
  sharing: boolean;
  needsCarrier: boolean;
  fare: string;
  deposit: string;
};

type Errors = Partial<Record<keyof Form | 'scheduledAt', string>>;

const EMPTY_FORM: Form = {
  pickup: '',
  drop: '',
  riderName: '',
  riderPhone: '',
  vehicleClass: '',
  preferSafeRoute: false,
  sharing: false,
  needsCarrier: false,
  fare: '',
  deposit: '',
};

const validate = (form: Form, scheduledAt: Date): Errors => {
  const errors: Errors = {};
  const fare = Number(form.fare);
  const deposit = Number(form.deposit);
  const latestBookable = new Date();
  latestBookable.setDate(latestBookable.getDate() + MARKETPLACE_MAX_AHEAD_DAYS);
  latestBookable.setHours(23, 59, 59, 999);

  if (form.pickup.trim().length < 3) errors.pickup = dc("Enter the full pickup location.");
  if (form.drop.trim().length < 3) errors.drop = dc("Enter the full drop location.");
  if (form.pickup.trim().toLowerCase() === form.drop.trim().toLowerCase() && form.pickup.trim()) {
    errors.drop = dc("Pickup and drop must be different.");
  }
  if (scheduledAt.getTime() < Date.now() + MARKETPLACE_MIN_LEAD_MS) {
    errors.scheduledAt = dc("Choose a pickup time at least 30 minutes from now.");
  } else if (scheduledAt.getTime() > latestBookable.getTime()) {
    errors.scheduledAt = dc("Bookings can only be posted up to 7 days ahead.");
  }
  if (form.riderName.trim().length < 2) errors.riderName = dc("Enter the rider's name.");
  if (form.riderPhone.replace(/\D/g, '').length !== 10) errors.riderPhone = dc("Enter a 10-digit phone number.");
  if (!form.vehicleClass) errors.vehicleClass = dc("Choose the car the rider booked.");
  if (!Number.isFinite(fare) || fare <= 0) errors.fare = dc("Enter the fare the rider will pay.");
  if (!Number.isFinite(deposit) || deposit < 50) errors.deposit = dc("The minimum marketplace deposit is ₹50.");
  else if (Number.isFinite(fare) && deposit >= fare) errors.deposit = dc("The deposit must be less than the fare.");

  return errors;
};

const FieldError = ({ children }: { children?: string }) => children ? (
  <AppText className="text-xs" style={{ color: ERROR }}>{children}</AppText>
) : null;

type RideOptionRowProps = {
  label: string;
  note: string;
  on: boolean;
  onToggle: () => void;
};

const RideOptionRow = ({ label, note, on, onToggle }: RideOptionRowProps) => {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={onToggle}
      className="flex-row items-center gap-4 py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <AppText className="text-base font-medium text-ink">{label}</AppText>
        <AppText className="text-sm leading-snug text-ink-muted">{note}</AppText>
      </View>
      <View
        pointerEvents="none"
        className="h-[22px] w-[50px] justify-center"
      >
        <View
          className="h-[14px] w-[50px] rounded-full"
          style={{ backgroundColor: on ? colors.primary : colors.borderUi }}
        />
        <View
          className="absolute h-[22px] w-[22px] rounded-full"
          style={{
            left: on ? 28 : 0,
            backgroundColor: '#FFFFFF',
            borderColor: colors.borderUi,
            borderWidth: 1,
          }}
        />
      </View>
    </Pressable>
  );
};

const MarketplacePostSheet = ({ visible, onClose, onSubmit }: Props) => {
    useCopyLanguage();
  const { colors, scheme } = useTheme();
  const mutedControlSurface = scheme === 'light' ? colors.surfaceMuted : undefined;
  const { height: windowHeight } = useWindowDimensions();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [scheduledAt, setScheduledAt] = useState(getDefaultScheduledAt);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [posting, setPosting] = useState(false);
  const postButtonScale = useSharedValue(1);

  const maxSheetHeight = Math.max(windowHeight - keyboardHeight - SHEET_TOP_GAP, 0);
  const sheetTranslateY = useSharedValue(120);

  const errors = useMemo(() => validate(form, scheduledAt), [form, scheduledAt]);
  const sheetMotionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() }],
  }));
  const fare = Number(form.fare) || 0;
  const deposit = Number(form.deposit) || 0;
  const fee = deposit * MARKETPLACE_POSTER_FEE_RATE;
  const canContinueRoute = !errors.pickup && !errors.drop && !errors.scheduledAt;
  const canContinueRider = !errors.riderName && !errors.riderPhone && !errors.vehicleClass;
  const canSubmit = Object.keys(errors).length === 0;
  const canAdvance = step === 0 ? canContinueRoute : step === 1 ? canContinueRider : canSubmit;

  useEffect(() => {
    if (!visible) return;

    setForm(EMPTY_FORM);
    setScheduledAt(getDefaultScheduledAt());
    setSubmitted(false);
    setStep(0);
    setKeyboardHeight(0);
    sheetTranslateY.set(withTiming(0, {
      duration: 240,
      reduceMotion: ReduceMotion.System,
    }));

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event) => {
      // Android already resizes this modal window through adjustResize. Applying
      // the reported keyboard height there as well would shrink the sheet twice.
      setKeyboardHeight(Platform.OS === 'ios' ? event.endCoordinates.height : 0);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => { shown.remove(); hidden.remove(); };
  }, [visible, sheetTranslateY]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  const submit = () => {
    if (step < 2) {
      setSubmitted(true);
      const invalidStep = step === 0
        ? Boolean(errors.pickup || errors.drop || errors.scheduledAt)
        : Boolean(errors.riderName || errors.riderPhone || errors.vehicleClass);
      if (invalidStep) return;
      setSubmitted(false);
      setStep((current) => current + 1);
      return;
    }
    setSubmitted(true);
    if (!canSubmit) return;

    setPosting(true);
    postButtonScale.set(withTiming(0.97, {
      duration: 100,
      reduceMotion: ReduceMotion.System,
    }));

    Keyboard.dismiss();
    onSubmit({
      id: `local-${Date.now()}`,
      pickupAddress: form.pickup.trim(),
      dropAddress: form.drop.trim(),
      scheduledAt: scheduledAt.toISOString(),
      fare,
      deposit,
      vehicleClass: form.vehicleClass,
      status: 'open',
      mine: true,
      riderName: form.riderName.trim(),
      riderPhone: form.riderPhone.replace(/\D/g, ''),
      preferSafeRoute: form.preferSafeRoute,
      sharing: form.sharing,
      needsCarrier: form.needsCarrier,
    });
  };

  const postButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: postButtonScale.get() }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View
        className="flex-1 justify-end"
        style={{ paddingBottom: keyboardHeight }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dc("Close post form")}
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]}
        />
        <Animated.View
          accessibilityViewIsModal
           style={[sheetMotionStyle, {
             width: '100%',
             maxHeight: maxSheetHeight,
             backgroundColor: colors.surface,
             borderTopLeftRadius: 24,
             borderTopRightRadius: 24,
            overflow: 'hidden',
          }]}
         >
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: HAIRLINE }} />
          </View>

          <View className="flex-row items-start gap-3 px-5 pb-4">
            <View className="flex-1 gap-1">
              <AppText className={`text-xl font-semibold ${INK}`} style={{ letterSpacing: -0.72 }}>{dc("Post a booking")}</AppText>
              <AppText className={`text-sm ${MUTED}`}>{dc("Share an off-app ride another captain can take.")}</AppText>
            </View>
            <Pressable
              role="button"
              aria-label={dc("Close post form")}
              hitSlop={10}
              onPress={close}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: mutedControlSurface ?? WELL,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <XIcon size={17} weight="bold" color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            nestedScrollEnabled
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 16 }}
          >
            <View className="gap-2" style={{ display: step === 0 ? 'flex' : 'none' }}>
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Route")}</AppText>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Pickup")}</AppText>
                <LocationAutocompleteInput
                  value={form.pickup}
                  onChange={(value) => set('pickup', value)}
                  placeholder={dc("Pickup address")}
                  error={submitted && Boolean(errors.pickup)}
                  backgroundColor={mutedControlSurface}
                />
                <FieldError>{submitted ? errors.pickup : undefined}</FieldError>
              </View>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Drop")}</AppText>
                <LocationAutocompleteInput
                  value={form.drop}
                  onChange={(value) => set('drop', value)}
                  placeholder={dc("Drop address")}
                  error={submitted && Boolean(errors.drop)}
                  backgroundColor={mutedControlSurface}
                />
                <FieldError>{submitted ? errors.drop : undefined}</FieldError>
              </View>
            </View>

            <View className="gap-0" style={{ display: step === 0 ? 'flex' : 'none' }}>
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Pickup time")}</AppText>
              <DateTimeSelector value={scheduledAt} onChange={setScheduledAt} />
              <FieldError>{submitted ? errors.scheduledAt : undefined}</FieldError>
              {!submitted || !errors.scheduledAt ? (
                <AppText className={`text-xs ${MUTED}`}>{dc("Post rides from 30 minutes to 7 days ahead.")}</AppText>
              ) : null}
            </View>

            <View className="gap-3" style={{ display: step === 1 ? 'flex' : 'none' }}>
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Rider")}</AppText>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Name")}</AppText>
                <Input prop={{ variant: 'light', bg: mutedControlSurface, get "placeholder"() { return dc("Rider name"); }, value: form.riderName, onChangeFn: (value) => set('riderName', value), error: submitted && Boolean(errors.riderName) }} />
                <FieldError>{submitted ? errors.riderName : undefined}</FieldError>
              </View>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Phone")}</AppText>
                <Input prop={{ variant: 'light', bg: mutedControlSurface, type: 'tel', get "placeholder"() { return dc("10-digit mobile number"); }, value: form.riderPhone, maxLength: 10, onChangeFn: (value) => set('riderPhone', value.replace(/\D/g, '')), error: submitted && Boolean(errors.riderPhone) }} />
                <FieldError>{submitted ? errors.riderPhone : undefined}</FieldError>
              </View>
              <AppText className={`text-xs ${MUTED}`}>{dc("Rider details stay private until another captain pays the deposit.")}</AppText>
            </View>

            <View className="gap-2" style={{ display: step === 1 ? 'flex' : 'none' }}>
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Vehicle")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {VEHICLE_CLASSES.map((option) => {
                  const selected = form.vehicleClass === option;
                  return (
                    <Pressable
                      key={option}
                      role="radio"
                      aria-checked={selected}
                      onPress={() => set('vehicleClass', option)}
                      style={({ pressed }) => ({
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: colors.surfaceMuted,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.primary : colors.borderUi,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <AppText className={`text-sm ${selected ? 'font-semibold' : 'font-medium'} ${INK}`}>
                        {vehicleLabel(option)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <FieldError>{submitted ? errors.vehicleClass : undefined}</FieldError>
            </View>

            <View className="gap-1" style={{ display: step === 1 ? 'flex' : 'none' }}>
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Ride options")}</AppText>
              <View>
                <RideOptionRow
                  label={dc("Sharing")}
                  note={dc("Allow another rider to share this trip.")}
                  on={form.sharing}
                  onToggle={() => set('sharing', !form.sharing)}
                />
                <View className="h-px" style={{ backgroundColor: colors.borderUi }} />
                <RideOptionRow
                  label={dc("Roof carrier")}
                  note={dc("The rider needs luggage space on top.")}
                  on={form.needsCarrier}
                  onToggle={() => set('needsCarrier', !form.needsCarrier)}
                />
                <View className="h-px" style={{ backgroundColor: colors.borderUi }} />
                <RideOptionRow
                  label={dc("Safer route")}
                  note={dc("Prefer a safer route when available.")}
                  on={form.preferSafeRoute}
                  onToggle={() => set('preferSafeRoute', !form.preferSafeRoute)}
                />
              </View>
            </View>

            <View className="gap-3" style={{ display: step === 2 ? 'flex' : 'none' }}>
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Money")}</AppText>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Fare the rider pays")}</AppText>
                <Input leading={<AppText className={INK}>₹</AppText>} prop={{ variant: 'light', bg: mutedControlSurface, type: 'number', placeholder: '0', value: form.fare, onChangeFn: (value) => set('fare', value.replace(/\D/g, '')), error: submitted && Boolean(errors.fare) }} />
                <FieldError>{submitted ? errors.fare : undefined}</FieldError>
              </View>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Marketplace deposit")}</AppText>
                <Input leading={<AppText className={INK}>₹</AppText>} prop={{ variant: 'light', bg: mutedControlSurface, type: 'number', get "placeholder"() { return dc("Minimum 50"); }, value: form.deposit, onChangeFn: (value) => set('deposit', value.replace(/\D/g, '')), error: submitted && Boolean(errors.deposit) }} />
                <FieldError>{submitted ? errors.deposit : undefined}</FieldError>
                {!submitted || !errors.deposit ? (
                  <AppText className={`text-xs ${MUTED}`}>{dc("Minimum ₹50, and always less than the fare.")}</AppText>
                ) : null}
              </View>
            </View>

            <View className="rounded-2xl p-4 gap-2" style={{ display: step === 2 ? 'flex' : 'none', backgroundColor: colors.surfaceMuted }}>
              <View className="flex-row justify-between gap-3">
                <AppText className={`text-sm ${MUTED}`}>{dc("Deposit")}</AppText>
                <AppText className={`text-sm font-semibold ${INK}`}>{rupees(deposit)}</AppText>
              </View>
              <View className="flex-row justify-between gap-3">
                <AppText className={`text-sm ${MUTED}`}>{dc("Marketplace fee (10%)")}</AppText>
                <AppText className="text-sm font-semibold" style={{ color: ERROR }}>−{rupees(fee)}</AppText>
              </View>
              <View className="h-px" style={{ backgroundColor: HAIRLINE }} />
              <View className="flex-row justify-between gap-3">
                <View className="flex-1">
                  <AppText className={`text-sm font-semibold ${INK}`}>{dc("You receive")}</AppText>
                  <AppText className={`text-xs ${MUTED}`}>{dc("After the ride is completed")}</AppText>
                </View>
                <AppText className={`text-base font-semibold ${INK}`}>{rupees(Math.max(0, deposit - fee))}</AppText>
              </View>
            </View>
          </ScrollView>

          <View className="w-full gap-1 px-5 pt-3 pb-6 bg-surface">
            <Animated.View style={postButtonStyle}>
              <Button prop={{ disabled: !canAdvance || posting }} onPress={submit}>
                {posting ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <AppText className="text-base font-semibold text-on-strong">
                      {dc("Posting...")}
                    </AppText>
                  </View>
                ) : (
                  step < 2 ? dc("Continue") : dc("Post booking")
                )}
              </Button>
            </Animated.View>
            <AppText className={`text-xs text-center ${MUTED}`}>{dc("The rider pays the claiming captain") + " "}{rupees(fare)}{" " + dc("directly.")}</AppText>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default MarketplacePostSheet;

import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { XIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { rupees, vehicleLabel } from '../../constants/booking';
import {
  MARKETPLACE_POSTER_FEE_RATE,
  type MarketplaceListing,
} from '../../constants/marketplace';
import Button from './Button';
import Input from './Input';
import { useTheme } from '../../theme/ThemeContext';

const HAIRLINE = 'rgba(18,18,32,0.12)';
const SCRIM = 'rgba(18,18,32,0.52)';
const WELL = 'rgba(18,18,32,0.04)';
const ERROR = '#B91C1C';

const SHEET_TOP_GAP = 16;
const MIDDLE_SNAP_RATIO = 0.68;
const MIN_MIDDLE_HEIGHT = 420;
const FLING_VELOCITY = 0.45;
const SNAP_DRAG_THRESHOLD = 56;
const SNAP_ANIMATION = { damping: 24, stiffness: 240, mass: 0.9 } as const;

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
  date: string;
  time: string;
  riderName: string;
  riderPhone: string;
  vehicleClass: string;
  fare: string;
  deposit: string;
};

type Errors = Partial<Record<keyof Form, string>>;

const EMPTY_FORM: Form = {
  pickup: '',
  drop: '',
  date: '',
  time: '',
  riderName: '',
  riderPhone: '',
  vehicleClass: '',
  fare: '',
  deposit: '',
};

const maskDate = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
};

const maskTime = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean).join(':');
};

const scheduledAtFor = (dateValue: string, timeValue: string): Date | null => {
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return null;

  const [, dd, mm, yyyy] = dateMatch;
  const [, hours, minutes] = timeMatch;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hours), Number(minutes));

  if (
    date.getFullYear() !== Number(yyyy)
    || date.getMonth() !== Number(mm) - 1
    || date.getDate() !== Number(dd)
    || date.getHours() !== Number(hours)
    || date.getMinutes() !== Number(minutes)
  ) return null;

  return date;
};

const validate = (form: Form): Errors => {
  const errors: Errors = {};
  const fare = Number(form.fare);
  const deposit = Number(form.deposit);
  const scheduledAt = scheduledAtFor(form.date, form.time);

  if (form.pickup.trim().length < 3) errors.pickup = dc("Enter the full pickup location.");
  if (form.drop.trim().length < 3) errors.drop = dc("Enter the full drop location.");
  if (form.pickup.trim().toLowerCase() === form.drop.trim().toLowerCase() && form.pickup.trim()) {
    errors.drop = dc("Pickup and drop must be different.");
  }
  if (!scheduledAt) errors.date = dc("Enter a valid date and time.");
  else if (scheduledAt.getTime() <= Date.now()) errors.date = dc("Choose a future pickup time.");
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

const MarketplacePostSheet = ({ visible, onClose, onSubmit }: Props) => {
    useCopyLanguage();
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const fullHeight = Math.max(windowHeight - keyboardHeight - SHEET_TOP_GAP, 0);
  const middleHeight = Math.min(
    fullHeight,
    Math.max(Math.round(fullHeight * MIDDLE_SNAP_RATIO), MIN_MIDDLE_HEIGHT),
  );
  const sheetHeight = useRef(new Animated.Value(middleHeight)).current;
  const gestureStartY = useRef(0);
  const snapHeights = useRef({ middle: middleHeight, full: fullHeight });
  const expandedRef = useRef(expanded);
  snapHeights.current = { middle: middleHeight, full: fullHeight };
  expandedRef.current = expanded;

  const animateTo = useCallback((nextExpanded: boolean) => {
    const target = nextExpanded ? snapHeights.current.full : snapHeights.current.middle;
    setExpanded(nextExpanded);
    Animated.spring(sheetHeight, {
      toValue: target,
      damping: SNAP_ANIMATION.damping,
      stiffness: SNAP_ANIMATION.stiffness,
      mass: SNAP_ANIMATION.mass,
      useNativeDriver: false,
    }).start();
  }, [sheetHeight]);

  const handlePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: (event) => {
      gestureStartY.current = event.nativeEvent.pageY;
      sheetHeight.stopAnimation();
    },
    onPanResponderRelease: (event, gesture) => {
      const dragDistance = event.nativeEvent.pageY - gestureStartY.current;
      const movingUp = gesture.vy < -FLING_VELOCITY
        || (Math.abs(gesture.vy) <= FLING_VELOCITY && dragDistance < -SNAP_DRAG_THRESHOLD);
      const movingDown = gesture.vy > FLING_VELOCITY
        || (Math.abs(gesture.vy) <= FLING_VELOCITY && dragDistance > SNAP_DRAG_THRESHOLD);
      // A tap is useful when one-handed; a directional swipe still wins when
      // the captain moves far enough to make the intended snap unambiguous.
      animateTo(movingUp ? true : movingDown ? false : !expandedRef.current);
    },
    onPanResponderTerminate: () => animateTo(expandedRef.current),
    onPanResponderTerminationRequest: () => false,
  }), [animateTo, sheetHeight]);

  const errors = useMemo(() => validate(form), [form]);
  const fare = Number(form.fare) || 0;
  const deposit = Number(form.deposit) || 0;
  const fee = deposit * MARKETPLACE_POSTER_FEE_RATE;
  const canSubmit = Object.keys(errors).length === 0;

  useEffect(() => {
    if (!visible) {
      setExpanded(false);
      return;
    }

    setForm(EMPTY_FORM);
    setSubmitted(false);
    setKeyboardHeight(0);
    setExpanded(false);
    sheetHeight.setValue(snapHeights.current.middle);

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event) => {
      // Android already resizes this modal window through adjustResize. Applying
      // the reported keyboard height there as well would shrink the sheet twice.
      setKeyboardHeight(Platform.OS === 'ios' ? event.endCoordinates.height : 0);
      setExpanded(true);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => { shown.remove(); hidden.remove(); };
  }, [visible, sheetHeight]);

  useEffect(() => {
    if (!visible) return;
    animateTo(expanded);
  }, [animateTo, expanded, fullHeight, middleHeight, visible]);

  const set = (key: keyof Form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  const submit = () => {
    setSubmitted(true);
    if (!canSubmit) return;

    const scheduledAt = scheduledAtFor(form.date, form.time);
    if (!scheduledAt) return;

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
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 justify-end" style={{ paddingBottom: keyboardHeight }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dc("Close post form")}
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]}
        />
        <Animated.View
          accessibilityViewIsModal
          style={{
            height: sheetHeight,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
          }}
        >
          <View
            {...handlePan.panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={dc("Post booking sheet")}
            accessibilityHint={dc("Tap or swipe up to expand; swipe down to return to the middle height")}
            accessibilityValue={{ text: expanded ? 'Expanded' : dc("Middle height") }}
            accessibilityActions={[{ name: 'increment', get "label"() { return dc("Expand"); } }, { name: 'decrement', get "label"() { return dc("Collapse"); } }]}
            onAccessibilityAction={(event) => animateTo(event.nativeEvent.actionName === 'increment')}
            className="items-center pt-3 pb-2"
          >
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
                backgroundColor: WELL,
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
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 16 }}
          >
            <View className="gap-3">
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Route")}</AppText>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Pickup")}</AppText>
                <Input prop={{ variant: 'light', get "placeholder"() { return dc("Pickup address"); }, value: form.pickup, onChangeFn: (value) => set('pickup', value), error: submitted && Boolean(errors.pickup) }} />
                <FieldError>{submitted ? errors.pickup : undefined}</FieldError>
              </View>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Drop")}</AppText>
                <Input prop={{ variant: 'light', get "placeholder"() { return dc("Drop address"); }, value: form.drop, onChangeFn: (value) => set('drop', value), error: submitted && Boolean(errors.drop) }} />
                <FieldError>{submitted ? errors.drop : undefined}</FieldError>
              </View>
            </View>

            <View className="gap-3">
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Pickup time")}</AppText>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <AppText className={`text-sm font-semibold ${INK}`}>{dc("Date")}</AppText>
                  <Input prop={{ variant: 'light', type: 'number', get "placeholder"() { return dc("DD/MM/YYYY"); }, value: form.date, maxLength: 10, onChangeFn: (value) => set('date', maskDate(value)), error: submitted && Boolean(errors.date) }} />
                </View>
                <View className="w-[34%]">
                  <AppText className={`text-sm font-semibold ${INK}`}>{dc("Time")}</AppText>
                  <Input prop={{ variant: 'light', type: 'number', get "placeholder"() { return dc("HH:MM"); }, value: form.time, maxLength: 5, onChangeFn: (value) => set('time', maskTime(value)), error: submitted && Boolean(errors.date) }} />
                </View>
              </View>
              <FieldError>{submitted ? errors.date : undefined}</FieldError>
            </View>

            <View className="gap-3">
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Rider")}</AppText>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Name")}</AppText>
                <Input prop={{ variant: 'light', get "placeholder"() { return dc("Rider name"); }, value: form.riderName, onChangeFn: (value) => set('riderName', value), error: submitted && Boolean(errors.riderName) }} />
                <FieldError>{submitted ? errors.riderName : undefined}</FieldError>
              </View>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Phone")}</AppText>
                <Input prop={{ variant: 'light', type: 'tel', get "placeholder"() { return dc("10-digit mobile number"); }, value: form.riderPhone, maxLength: 10, onChangeFn: (value) => set('riderPhone', value.replace(/\D/g, '')), error: submitted && Boolean(errors.riderPhone) }} />
                <FieldError>{submitted ? errors.riderPhone : undefined}</FieldError>
              </View>
              <AppText className={`text-xs ${MUTED}`}>{dc("Rider details stay private until another captain pays the deposit.")}</AppText>
            </View>

            <View className="gap-2">
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
                        backgroundColor: selected ? colors.strong : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.strong : colors.borderUi,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <AppText className={`text-sm font-semibold ${selected ? 'text-white' : INK}`}>
                        {vehicleLabel(option)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <FieldError>{submitted ? errors.vehicleClass : undefined}</FieldError>
            </View>

            <View className="gap-3">
              <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{dc("Money")}</AppText>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Fare the rider pays")}</AppText>
                <Input leading={<AppText className={INK}>₹</AppText>} prop={{ variant: 'light', type: 'number', placeholder: '0', value: form.fare, onChangeFn: (value) => set('fare', value.replace(/\D/g, '')), error: submitted && Boolean(errors.fare) }} />
                <FieldError>{submitted ? errors.fare : undefined}</FieldError>
              </View>
              <View>
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Marketplace deposit")}</AppText>
                <Input leading={<AppText className={INK}>₹</AppText>} prop={{ variant: 'light', type: 'number', get "placeholder"() { return dc("Minimum 50"); }, value: form.deposit, onChangeFn: (value) => set('deposit', value.replace(/\D/g, '')), error: submitted && Boolean(errors.deposit) }} />
                <FieldError>{submitted ? errors.deposit : undefined}</FieldError>
                {!submitted || !errors.deposit ? (
                  <AppText className={`text-xs ${MUTED}`}>{dc("Minimum ₹50, and always less than the fare.")}</AppText>
                ) : null}
              </View>
            </View>

            <View className="rounded-2xl p-4 gap-2" style={{ backgroundColor: colors.surfaceMuted }}>
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
            <Button onPress={submit}>{dc("Post booking")}</Button>
            <AppText className={`text-xs text-center ${MUTED}`}>{dc("The rider pays the claiming captain") + " "}{rupees(fare)}{" " + dc("directly.")}</AppText>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default MarketplacePostSheet;

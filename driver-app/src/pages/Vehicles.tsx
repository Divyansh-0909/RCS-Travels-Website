import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { CaretDownIcon, CarIcon, PlusIcon, TrashIcon, XIcon } from 'phosphor-react-native';
import { useLocation, useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import InlineError from '../components/ui/InlineError';
import AccountDetailScreen from '../components/ui/AccountDetailScreen';
import { VehiclesSkeleton } from '../components/ui/LoadingSkeletons';
import { useApi } from '../hooks/useApi';
import { useBottomSheetMotion } from '../hooks/useBottomSheetMotion';
import { sheetSurfaceStyle } from '../components/ui/sheetSurfaceStyle';
import { useDriver } from '../hooks/useDriver';
import { type Vehicle, type VehiclesResponse, verificationLabel } from '../lib/documentState';
import { VEHICLE_NUMBER_INPUT_MAX_LENGTH, VEHICLE_NUMBER_MAX_LENGTH, VEHICLE_NUMBER_MIN_LENGTH, validateVehicleNumber } from '../lib/vehicleNumber';
import { vehicleClassLabel } from '../constants/documents';
import { useTheme } from '../theme/ThemeContext';

// The captain's cars.
//
// Almost every captain has exactly one, and for him this screen is a single card
// he never opens twice. It exists for the owner-drivers who keep a hatchback and
// an Innova and take whichever the booking asked for — and for them the whole
// point is the LAST tap on this screen, not the list: switching cars changes what
// dispatch offers him, what a rider is shown, and whether his papers are in order.
//
// Which is why the switch is not a segmented control at the top of Home. It is a
// deliberate action on a screen he had to navigate to, with the selected car
// kept unmistakable in the list.

const SCRIM = 'rgba(18,18,32,0.45)';
const WELL = 'rgba(18,18,32,0.04)';
const INK = 'text-ink';
const MUTED = 'text-ink-muted';
const TITLE_TRACKING = { letterSpacing: -0.72 };

// Solid negative, the same one Account's Log out uses. The auth shell's error red is
// tuned for a dark page and drops under AA here.
const ERROR_TEXT = '#B91C1C';
// The four the fare card is priced against. Kept in the same order the rider's
// booking screen lists them, so a captain picking his class sees the words a
// rider saw.
const CLASSES = ['hatchback', 'sedan', 'suv', 'suv_premium'] as const;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const STATE_ENTER = FadeIn.duration(170).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const STATE_EXIT = FadeOut.duration(110).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const ASYNC_CONTENT_ENTER = FadeInDown
  .duration(190)
  .easing(EASE_OUT)
  .reduceMotion(ReduceMotion.System)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] });

const AnimatedCaret = ({ open, color }: { open: boolean; color: string }) => {
  const style = useAnimatedStyle(() => ({
    transform: [{
      rotate: withTiming(open ? '180deg' : '0deg', {
        duration: 180,
        easing: EASE_OUT,
        reduceMotion: ReduceMotion.System,
      }),
    }],
  }));

  return (
    <Animated.View style={style}>
      <CaretDownIcon size={18} weight="bold" color={color} />
    </Animated.View>
  );
};

const Vehicles = () => {
    useCopyLanguage();
    const { colors } = useTheme();
  const api = useApi();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isRegistrationFlow = pathname === '/document/vehicle';
  const { profile, loading: driverLoading, refresh: refreshProfile } = useDriver();
  const { height: windowHeight } = useWindowDimensions();

  const [data, setData] = useState<VehiclesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The form's own error, separate from the page's.
  //
  // Both used to be `error`, which is rendered in a card at the TOP of this
  // scroller — so "Enter the number on the plate" was posted several hundred
  // pixels above the button that rejected the submit, usually off screen
  // entirely. From the captain's seat the button did nothing at all.
  const [formError, setFormError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [vehicleClass, setVehicleClass] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleNumberError, setVehicleNumberError] = useState<string | null>(null);
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleClassStatus, setVehicleClassStatus] = useState<'idle' | 'finding' | 'found' | 'manual' | 'error'>('idle');
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const vehicleClassRequestRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [closePressed, setClosePressed] = useState(false);
  const { mounted: addSheetMounted, scrimStyle, sheetStyle } = useBottomSheetMotion(
    adding,
    Math.max(windowHeight * 0.55, 420),
  );
  const vehicleClassError = formError === dc("Pick the kind of car") ? formError : null;
  const vehicleModelError = formError === dc("Enter the car's model") ? formError : null;
  const globalFormError = (
    formError && !vehicleClassError && !vehicleModelError ? formError : null
  ) ?? (isRegistrationFlow ? error : null);

  const load = useCallback(async () => {
    const result = await api.getVehicles();
    if (result.error) setError(result.error);
    else {
      setError(null);
      setData(result as VehiclesResponse);
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // Registration is a server-staged wizard. History/deep links should resume the
  // same step as HomeGate rather than letting a captain add a car before his
  // personal papers are present or return to this form after the car already
  // exists.
  useEffect(() => {
    if (!isRegistrationFlow || driverLoading || !profile) return;

    const { stage } = profile.onboarding;
    if (stage === 'personalDocuments') {
      navigate('/document', { replace: true });
      return;
    }
    if (stage === 'vehicle') return;
    if (stage === 'vehicleDocuments' && profile.activeVehicleId) {
      navigate(`/document?vehicleId=${profile.activeVehicleId}`, { replace: true });
      return;
    }
    if (stage === 'review') navigate('/', { replace: true });
  }, [driverLoading, isRegistrationFlow, navigate, profile]);

  useEffect(() => {
    if (!adding) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => { shown.remove(); hidden.remove(); };
  }, [adding]);

  const openAddSheet = useCallback(() => {
    setVehicleClass(null);
    setVehicleNumber('');
    setVehicleNumberError(null);
    setVehicleModel('');
    setVehicleClassStatus('idle');
    setClassPickerOpen(false);
    setFormError(null);
    setClosePressed(false);
    setKeyboardHeight(0);
    setAdding(true);
  }, []);

  const closeAddSheet = useCallback(() => {
    if (busy) return;

    Keyboard.dismiss();
    setAdding(false);
    setKeyboardHeight(0);
    if (isRegistrationFlow) navigate('/document', { replace: true });
  }, [busy, isRegistrationFlow, navigate]);

  useEffect(() => {
    if (!adding && !isRegistrationFlow) return;

    const model = vehicleModel.trim();
    const requestId = ++vehicleClassRequestRef.current;

    if (model.length < 2) {
      setVehicleClass(null);
      setVehicleClassStatus('idle');
      setClassPickerOpen(false);
      return;
    }

    setVehicleClass(null);
    setVehicleClassStatus('finding');
    setClassPickerOpen(false);

    const timer = setTimeout(async () => {
      const result = await api.classifyVehicleModel(model);
      if (vehicleClassRequestRef.current !== requestId) return;

      if (result?.vehicleClass && CLASSES.includes(result.vehicleClass)) {
        setVehicleClass(result.vehicleClass);
        setVehicleClassStatus('found');
        return;
      }

      setVehicleClass(null);
      setVehicleClassStatus('error');
    }, 300);

    return () => clearTimeout(timer);
  }, [adding, api, isRegistrationFlow, vehicleModel]);

  const switchTo = useCallback(async (vehicle: Vehicle) => {
    if (vehicle.isActive || busy) return;

    setBusy(true);
    const result = await api.setActiveVehicle(vehicle.id);
    setBusy(false);

    // The server owns every reason this can be refused — a ride in progress, a
    // scheduled booking the new car cannot serve, being online — and it writes
    // them to be read. Echoing its sentence is better than composing a vaguer
    // one here from a status code.
    if (result.error) {
      Alert.alert(dc("Cannot switch cars"), result.error);
      return;
    }

    await Promise.all([load(), refreshProfile()]);

    // Said plainly, because it is the consequence he did not ask for. Switching
    // to a car whose papers are not through takes him off the road, and finding
    // that out later — from a Go Online button that refuses — is how a captain
    // loses an afternoon.
    if (result.verificationStatus !== 'approved') {
      Alert.alert(
        dc("Now driving {{value0}}", {value0: (vehicle.number)}),
        dc("This car's documents aren't approved yet, so you can't go online in it. Switch back any time."),
      );
    }
  }, [api, busy, load, refreshProfile]);

  const remove = useCallback(async (vehicle: Vehicle) => {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        dc("Remove {{value0}}?", {value0: (vehicle.number)}),
        dc("Its documents are removed with it. You can add the car again later, but you would have to upload them all again."),
        [
          { get "text"() { return dc("Cancel"); }, style: 'cancel', onPress: () => resolve(false) },
          { get "text"() { return dc("Remove"); }, style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirmed) return;

    setBusy(true);
    const result = await api.removeVehicle(vehicle.id);
    setBusy(false);

    if (result.error) {
      Alert.alert(dc("Cannot remove this car"), result.error);
      return;
    }
    await load();
  }, [api, load]);

  const submitNew = useCallback(async () => {
    if (vehicleClassStatus === 'finding') return;
    if (!vehicleClass) { setFormError(dc("Pick the kind of car")); return; }

    const plate = validateVehicleNumber(vehicleNumber);
    if (!plate.valid) {
      const message = plate.reason === 'missing'
        ? dc("Enter the number on the plate")
        : plate.reason === 'too_short'
          ? dc("Registration number must be at least {{value0}} characters", { value0: VEHICLE_NUMBER_MIN_LENGTH })
          : plate.reason === 'too_long'
            ? dc("Registration number can be at most {{value0}} characters", { value0: VEHICLE_NUMBER_MAX_LENGTH })
            : plate.reason === 'characters'
              ? dc("Use only letters, numbers, spaces, and hyphens")
              : plate.reason === 'bh_format'
                ? dc("Check the BH-series registration number")
                : dc("Check the registration number");
      setVehicleNumberError(message);
      setFormError(null);
      return;
    }

    setVehicleNumberError(null);
    // Required, like the plate. A rider meeting this car at a gate is looking for
    // "the white Innova Crysta" — the class alone does not pick it out of a queue.
    if (vehicleModel.trim().length < 2) { setFormError(dc("Enter the car's model")); return; }

    setBusy(true);
    const result = await api.addVehicle({
      vehicleClass,
      vehicleNumber: plate.number,
      vehicleModel: vehicleModel.trim(),
    });
    setBusy(false);

    if (result.error) { setFormError(result.error); return; }

    Keyboard.dismiss();
    setAdding(false);
    setKeyboardHeight(0);
    setVehicleClass(null);
    setVehicleNumber('');
    setVehicleNumberError(null);
    setVehicleModel('');
    setVehicleClassStatus('idle');
    setClassPickerOpen(false);
    setFormError(null);
    await load();

    if (isRegistrationFlow) {
      await refreshProfile();
      navigate(`/document?vehicleId=${result.vehicle.id}`, { replace: true });
      return;
    }

    // Straight to the checklist for the car he just added. He added it in order
    // to upload its papers; making him find it in a list first is a step that
    // exists only because the screens are separate.
    navigate(`/account/documents?vehicleId=${result.vehicle.id}`);
  }, [api, isRegistrationFlow, load, navigate, refreshProfile, vehicleClass, vehicleClassStatus, vehicleNumber, vehicleModel]);

  if (isRegistrationFlow) {
    return (
      <View className="flex-1 w-full py-12">
        <View className="absolute left-2 right-2 top-10 z-10 h-12 items-center justify-center">
          <AppText className="text-xl font-normal text-[var(--text)]">
            <AppText className="font-semibold">RCS</AppText> captains
          </AppText>
        </View>

        <ScrollView
          className="flex-1 w-full bg-canvas"
          contentContainerStyle={{ paddingTop: 80, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full px-6 gap-5">
            <View className="w-full gap-1">
              <AppText className={`text-2xl font-semibold text-left ${INK}`}>
                {dc("Add your vehicle")}
              </AppText>
              <AppText className={`text-base text-left ${MUTED}`}>
                {dc("Enter your vehicle details to continue.")}
              </AppText>
            </View>

            <View className="w-full gap-3">
              <View className="gap-1">
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Number plate")}</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'text',
                    get "placeholder"() { return dc("Registration number"); },
                    value: vehicleNumber,
                    error: Boolean(vehicleNumberError),
                    maxLength: VEHICLE_NUMBER_INPUT_MAX_LENGTH,
                    onChangeFn: (value: string) => {
                      setVehicleNumber(value.toUpperCase());
                      setVehicleNumberError(null);
                      setFormError(null);
                    },
                  }}
                />
                {vehicleNumberError ? (
                  <InlineError message={vehicleNumberError} color={ERROR_TEXT} />
                ) : (
                  <AppText className={`text-xs ${MUTED}`}>
                    {dc("Spaces and hyphens are okay. We'll verify the number from your RC.")}
                  </AppText>
                )}
              </View>

              <View className="gap-1">
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Model")}</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'text',
                    get "placeholder"() { return dc("Model"); },
                    value: vehicleModel,
                    error: Boolean(vehicleModelError),
                    onChangeFn: (value: string) => {
                      vehicleClassRequestRef.current += 1;
                      setVehicleModel(value);
                      setFormError(null);
                    },
                  }}
                />
                <InlineError message={vehicleModelError} color={ERROR_TEXT} />
              </View>

              <View className="gap-2">
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Car type")}</AppText>
                <Pressable
                  role="button"
                  aria-label={dc("Car type")}
                  disabled={vehicleClassStatus === 'finding'}
                  onPress={() => setClassPickerOpen((open) => !open)}
                  className="min-h-12 flex-row items-center justify-between rounded-xl border px-4 py-3"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: vehicleClassError ? ERROR_TEXT : colors.borderUi,
                    opacity: vehicleClassStatus === 'finding' ? 0.75 : 1,
                  }}
                >
                  <Animated.View
                    key={`${vehicleClassStatus}-${vehicleClass ?? 'none'}`}
                    entering={STATE_ENTER}
                    exiting={STATE_EXIT}
                    style={{ flex: 1 }}
                  >
                    <AppText className={`text-base ${vehicleClass ? INK : MUTED}`}>
                      {vehicleClassStatus === 'finding'
                        ? `${dc("Classifing vehicle type")}…`
                        : vehicleClass
                          ? vehicleClassLabel(vehicleClass)
                          : dc("Choose car type")}
                    </AppText>
                  </Animated.View>
                  <AnimatedCaret open={classPickerOpen} color={colors.inkMuted} />
                </Pressable>

                <InlineError message={vehicleClassError} color={ERROR_TEXT} />

                {(vehicleClassStatus === 'found' || vehicleClassStatus === 'error') ? (
                  <Animated.View key={vehicleClassStatus} entering={STATE_ENTER} exiting={STATE_EXIT}>
                    <AppText className={`text-xs ${MUTED}`}>
                      {vehicleClassStatus === 'found'
                        ? dc("Suggested from model · Tap to change")
                        : dc("Couldn't identify it · Choose the car type")}
                    </AppText>
                  </Animated.View>
                ) : null}

                {classPickerOpen ? (
                  <Animated.View entering={STATE_ENTER} exiting={STATE_EXIT} className="flex-row flex-wrap gap-2">
                    {CLASSES.map((option) => {
                      const selected = vehicleClass === option;
                      return (
                        <Pressable
                          key={option}
                          role="radio"
                          aria-checked={selected}
                          onPress={() => {
                            setVehicleClass(option);
                            setVehicleClassStatus('manual');
                            setClassPickerOpen(false);
                            setFormError(null);
                          }}
                          className="min-h-11 justify-center rounded-xl px-3 py-2"
                          style={{
                            backgroundColor: selected ? colors.strong : colors.surface,
                            borderWidth: 1,
                            borderColor: selected ? colors.strong : colors.borderUi,
                          }}
                        >
                          <AppText className={`text-sm font-semibold ${selected ? 'text-white' : INK}`}>
                            {vehicleClassLabel(option)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </Animated.View>
                ) : null}
              </View>
            </View>

            <View className="w-full">
              <Button prop={{ disabled: busy || vehicleClassStatus === 'finding' }} onPress={submitNew}>
                {busy ? dc("Adding...") : dc("Add Car Documents")}
              </Button>
              <InlineError message={globalFormError} color={ERROR_TEXT} className="mt-2" />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <AccountDetailScreen title={dc("Your Cars")} centeredHeader>
        <VehiclesSkeleton />
      </AccountDetailScreen>
    );
  }

  const vehicles = data?.vehicles ?? [];
  const orderedVehicles = [...vehicles].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <>
      <Animated.View entering={ASYNC_CONTENT_ENTER} style={{ flex: 1, width: '100%' }}>
        <AccountDetailScreen title={dc("Your Cars")} centeredHeader>
          {error ? (
            <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: colors.surfaceMuted }}>
              <AppText className={`text-sm ${MUTED}`}>{error}</AppText>
            </View>
          ) : null}

          <View className="mx-4" style={{ backgroundColor: colors.canvas, gap: 3 }}>
          {orderedVehicles.map((vehicle, index) => (
            <View
              key={vehicle.id}
              className={`${index === 0 ? 'rounded-t-3xl rounded-b-sm' : 'rounded-sm'} ${vehicle.isActive ? 'px-5 py-5' : 'px-4 py-3.5'}`}
              // Match Account's grouped rows: the narrow canvas gap separates each
              // panel, while the first and last items own the outer rounded corners.
              style={{ backgroundColor: colors.surfaceMuted }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className={`${vehicle.isActive ? 'w-11 h-11 rounded-xl' : 'w-8 h-8'} items-center justify-center`}
                  style={{ backgroundColor: vehicle.isActive ? WELL : undefined }}
                >
                  <CarIcon size={vehicle.isActive ? 22 : 20} weight={vehicle.isActive ? 'fill' : 'regular'} color={colors.ink} />
                </View>
                <View className="flex-1">
                  <AppText
                    numberOfLines={1}
                    className={`${vehicle.isActive ? 'text-xl' : 'text-sm'} font-semibold ${INK}`}
                    style={vehicle.isActive ? TITLE_TRACKING : undefined}
                  >
                    {vehicle.number}
                  </AppText>
                  <AppText numberOfLines={1} className={`${vehicle.isActive ? 'text-sm' : 'text-xs'} ${MUTED}`}>
                    {verificationLabel(vehicle.verificationStatus)}
                    {vehicle.model ? dc("· {{value0}}", {value0: (vehicle.model)}) : ''}
                  </AppText>
                </View>
              </View>

              {vehicle.isActive ? (
                <View className="flex-row items-center justify-between gap-3 mt-3">
                  <View
                    className="shrink rounded-lg px-2.5 py-1"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <AppText numberOfLines={1} className="text-xs font-semibold uppercase tracking-wide text-white">
                      {vehicle.model ? `${vehicle.model} · ${vehicle.number}` : vehicle.number}
                    </AppText>
                  </View>

                  <View className="shrink-0 rounded-lg" style={{ backgroundColor: colors.surface }}>
                    <Pressable
                      role="button"
                      onPress={() => navigate(`/account/documents?vehicleId=${vehicle.id}`)}
                      hitSlop={8}
                      className="rounded-lg px-3 py-2"
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <AppText className={`text-sm font-semibold ${INK}`}>{dc("Documents")}</AppText>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {!vehicle.isActive ? (
                <View className="flex-row items-center gap-4 mt-3">
                <View className="rounded-lg" style={{ backgroundColor: colors.surface }}>
                  <Pressable
                    role="button"
                    onPress={() => navigate(`/account/documents?vehicleId=${vehicle.id}`)}
                    hitSlop={8}
                    className="rounded-lg px-3 py-2"
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <AppText className={`text-sm font-semibold ${INK}`}>{dc("Documents")}</AppText>
                  </Pressable>
                </View>

                <Pressable
                  role="button"
                  disabled={busy}
                  onPress={() => switchTo(vehicle)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    backgroundColor: colors.strong,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: pressed || busy ? 0.6 : 1,
                  })}
                >
                  <AppText className="text-sm font-semibold text-white">{dc("Drive this one")}</AppText>
                </Pressable>

                {/* Not offered for the car he is driving. The server refuses it too
                    — the four cached columns on his row are non-nullable and would
                    be left describing a car that no longer exists — but a button
                    that only ever produces an error is not a button. */}
                <Pressable
                  role="button"
                  aria-label={dc("Remove {{value0}}", {value0: (vehicle.number)})}
                  disabled={busy}
                  onPress={() => remove(vehicle)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1, marginLeft: 'auto' })}
                >
                  <TrashIcon size={18} weight="regular" color="#92400E" />
                </Pressable>
              </View>
              ) : null}
            </View>
          ))}

          <View className="rounded-b-3xl" style={{ backgroundColor: colors.surfaceMuted }}>
            <Pressable
              role="button"
              onPress={openAddSheet}
              className="rounded-b-3xl px-4 py-3.5 flex-row items-center gap-3"
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
              })}
            >
            <View className="w-8 h-8 items-center justify-center">
              <PlusIcon size={20} weight="bold" color={colors.ink} />
            </View>
            <AppText className={`text-sm font-semibold ${INK}`}>{dc("Add another car")}</AppText>
            </Pressable>
          </View>
          </View>
        </AccountDetailScreen>
      </Animated.View>

      <Modal
        visible={addSheetMounted}
        transparent
        animationType="none"
        onRequestClose={closeAddSheet}
      >
        <View className="flex-1 justify-end" style={{ paddingBottom: keyboardHeight }}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM }, scrimStyle]}
          />
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeAddSheet} />
          <Animated.View style={sheetStyle}>
            <Pressable
            accessibilityViewIsModal
            className="bg-surface rounded-t-3xl px-5 pt-5"
            style={[sheetSurfaceStyle, { maxHeight: Math.max(windowHeight - keyboardHeight - 16, 240) }]}
            onPress={() => {}}
            >
            <View className="flex-row items-start gap-3 pb-4">
              <View className="flex-1 gap-1">
                <AppText className={`text-lg font-semibold ${INK}`}>
                  {isRegistrationFlow ? dc("Add your vehicle") : dc("Add a car")}
                </AppText>
                <AppText className={`text-sm ${MUTED}`}>{dc("Enter the model and we'll find the car type. You can change it if needed.")}</AppText>
              </View>

              <Pressable
                role="button"
                aria-label={dc("Close")}
                disabled={busy}
                hitSlop={10}
                onPress={closeAddSheet}
                onPressIn={() => setClosePressed(true)}
                onPressOut={() => setClosePressed(false)}
                className="rounded-full items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: WELL,
                  opacity: busy ? 0.4 : closePressed ? 0.6 : 1,
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
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Model")}</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'text',
                    get "placeholder"() { return dc("Model"); },
                    value: vehicleModel,
                    error: Boolean(vehicleModelError),
                    onChangeFn: (value: string) => {
                      vehicleClassRequestRef.current += 1;
                      setVehicleModel(value);
                      setFormError(null);
                    },
                  }}
                />
                <InlineError message={vehicleModelError} color={ERROR_TEXT} />
              </View>

              <View className="gap-2">
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Car type")}</AppText>
                <Pressable
                  role="button"
                  aria-label={dc("Car type")}
                  disabled={vehicleClassStatus === 'finding'}
                  onPress={() => setClassPickerOpen((open) => !open)}
                  className="min-h-12 flex-row items-center justify-between rounded-xl border px-4 py-3"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: vehicleClassError ? ERROR_TEXT : colors.borderUi,
                    opacity: vehicleClassStatus === 'finding' ? 0.75 : 1,
                  }}
                >
                  <Animated.View
                    key={`${vehicleClassStatus}-${vehicleClass ?? 'none'}`}
                    entering={STATE_ENTER}
                    exiting={STATE_EXIT}
                    style={{ flex: 1 }}
                  >
                    <AppText className={`text-base ${vehicleClass ? INK : MUTED}`}>
                      {vehicleClassStatus === 'finding'
                        ? `${dc("Classifing vehicle type")}…`
                        : vehicleClass
                          ? vehicleClassLabel(vehicleClass)
                          : dc("Choose car type")}
                    </AppText>
                  </Animated.View>
                  <AnimatedCaret open={classPickerOpen} color={colors.inkMuted} />
                </Pressable>

                <InlineError message={vehicleClassError} color={ERROR_TEXT} />

                {(vehicleClassStatus === 'found' || vehicleClassStatus === 'error') ? (
                  <Animated.View key={vehicleClassStatus} entering={STATE_ENTER} exiting={STATE_EXIT}>
                    <AppText className={`text-xs ${MUTED}`}>
                      {vehicleClassStatus === 'found'
                        ? dc("Suggested from model · Tap to change")
                        : dc("Couldn't identify it · Choose the car type")}
                    </AppText>
                  </Animated.View>
                ) : null}

                {classPickerOpen ? (
                  <Animated.View entering={STATE_ENTER} exiting={STATE_EXIT} className="flex-row flex-wrap gap-2">
                    {CLASSES.map((option) => {
                      const selected = vehicleClass === option;
                      return (
                        <Pressable
                          key={option}
                          role="radio"
                          aria-checked={selected}
                          onPress={() => {
                            setVehicleClass(option);
                            setVehicleClassStatus('manual');
                            setClassPickerOpen(false);
                            setFormError(null);
                          }}
                          className="min-h-11 justify-center rounded-xl px-3 py-2"
                          style={{
                            backgroundColor: selected ? colors.strong : colors.surface,
                            borderWidth: 1,
                            borderColor: selected ? colors.strong : colors.borderUi,
                          }}
                        >
                          <AppText className={`text-sm font-semibold ${selected ? 'text-white' : INK}`}>
                            {vehicleClassLabel(option)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </Animated.View>
                ) : null}
              </View>

              <View className="gap-1">
                <AppText className={`text-sm font-semibold ${INK}`}>{dc("Number plate")}</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'text',
                    get "placeholder"() { return dc("Number plate"); },
                    value: vehicleNumber,
                    error: Boolean(vehicleNumberError),
                    maxLength: VEHICLE_NUMBER_INPUT_MAX_LENGTH,
                    onChangeFn: (value: string) => {
                      setVehicleNumber(value.toUpperCase());
                      setVehicleNumberError(null);
                      setFormError(null);
                    },
                  }}
                />
                {vehicleNumberError ? (
                  <InlineError message={vehicleNumberError} color={ERROR_TEXT} />
                ) : (
                  <AppText className={`text-xs ${MUTED}`}>
                    {dc("Spaces and hyphens are okay. We'll verify the number from your RC.")}
                  </AppText>
                )}
              </View>

              <View className="pt-1">
                <Button prop={{ disabled: busy || vehicleClassStatus === 'finding' }} onPress={submitNew}>
                  {busy
                    ? dc("Adding...")
                    : isRegistrationFlow
                      ? dc("Add Car Documents")
                      : dc("Add car")}
                </Button>
                <InlineError message={globalFormError} color={ERROR_TEXT} className="mt-2" />
              </View>
            </ScrollView>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

export default Vehicles;




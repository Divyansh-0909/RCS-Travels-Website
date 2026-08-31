import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { CarIcon, PlusIcon, TrashIcon, XIcon } from 'phosphor-react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import BackButton from '../components/ui/BackButton';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import AccountDetailScreen from '../components/ui/AccountDetailScreen';
import { DetailSectionsSkeleton } from '../components/ui/LoadingSkeletons';
import { useApi } from '../hooks/useApi';
import { verificationLabel, type Vehicle, type VehiclesResponse } from '../lib/documentState';
import { vehicleClassLabel } from '../constants/documents';

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

const CARD = '#f3f3f3';
const HAIRLINE = 'rgba(18,18,32,0.1)';
const PRIMARY = '#243AFB';
const SCRIM = 'rgba(18,18,32,0.45)';
const WELL = 'rgba(18,18,32,0.04)';
const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const TITLE_TRACKING = { letterSpacing: -0.72 };
const ICON_INK = '#121220';

// Solid negative, the same one Account's Log out uses. The auth shell's error red is
// tuned for a dark page and drops under AA here.
const ERROR_TEXT = '#B91C1C';
// Not the 132 the boards reserve, for the reason Documents gives: this screen is a
// drill-down (see isDrillDown), so there is no floating bar at the foot of it and no
// scrim either. The clearance those needed would just be an inch of white under the
// add-another row. What is left is the ordinary breathing room at the end of a list.
const TAIL_PADDING = 32;

// Under the title band only, and the same 12 the Documents screen uses. The
// scroller's gap of 8 is the rhythm BETWEEN cards, and letting the heading sit at
// that same distance made it read as the first card in the stack rather than as the
// thing the stack is under. The two screens are one tap apart, so if that number
// changes there, change it here with it.
const HEADING_GAP = 12;

// The four the fare card is priced against. Kept in the same order the rider's
// booking screen lists them, so a captain picking his class sees the words a
// rider saw.
const CLASSES = ['hatchback', 'sedan', 'suv', 'suv_premium'] as const;

// Green only for a car that can actually be driven today; amber for one that
// needs him to do something; grey for one still working its way through.
const toneFor = (status: Vehicle['verificationStatus']) =>
  status === 'approved' ? 'text-[#166534]'
    : status === 'rejected' ? 'text-[#92400E]'
      : MUTED;

const Vehicles = () => {
  const api = useApi();
  const navigate = useNavigate();
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
  const [vehicleModel, setVehicleModel] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [closePressed, setClosePressed] = useState(false);

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
    setVehicleModel('');
    setFormError(null);
    setClosePressed(false);
    setKeyboardHeight(0);
    setAdding(true);
  }, []);

  const closeAddSheet = useCallback(() => {
    if (busy) return;

    Keyboard.dismiss();
    setAdding(false);
    setVehicleClass(null);
    setVehicleNumber('');
    setVehicleModel('');
    setFormError(null);
    setKeyboardHeight(0);
  }, [busy]);

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
      Alert.alert('Cannot switch cars', result.error);
      return;
    }

    await load();

    // Said plainly, because it is the consequence he did not ask for. Switching
    // to a car whose papers are not through takes him off the road, and finding
    // that out later — from a Go Online button that refuses — is how a captain
    // loses an afternoon.
    if (result.verificationStatus !== 'approved') {
      Alert.alert(
        `Now driving ${vehicle.number}`,
        "This car's documents aren't approved yet, so you can't go online in it. Switch back any time.",
      );
    }
  }, [api, busy, load]);

  const remove = useCallback(async (vehicle: Vehicle) => {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        `Remove ${vehicle.number}?`,
        'Its documents are removed with it. You can add the car again later, but you would have to upload them all again.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirmed) return;

    setBusy(true);
    const result = await api.removeVehicle(vehicle.id);
    setBusy(false);

    if (result.error) {
      Alert.alert('Cannot remove this car', result.error);
      return;
    }
    await load();
  }, [api, load]);

  const submitNew = useCallback(async () => {
    if (!vehicleClass) { setFormError('Pick the kind of car'); return; }
    if (vehicleNumber.trim().length < 4) { setFormError('Enter the number on the plate'); return; }
    // Required, like the plate. A rider meeting this car at a gate is looking for
    // "the white Innova Crysta" — the class alone does not pick it out of a queue.
    if (vehicleModel.trim().length < 2) { setFormError("Enter the car's model"); return; }

    setBusy(true);
    const result = await api.addVehicle({
      vehicleClass,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      vehicleModel: vehicleModel.trim(),
    });
    setBusy(false);

    if (result.error) { setFormError(result.error); return; }

    Keyboard.dismiss();
    setAdding(false);
    setKeyboardHeight(0);
    setVehicleClass(null);
    setVehicleNumber('');
    setVehicleModel('');
    setFormError(null);
    await load();

    // Straight to the checklist for the car he just added. He added it in order
    // to upload its papers; making him find it in a list first is a step that
    // exists only because the screens are separate.
    navigate(`/account/documents?vehicleId=${result.vehicle.id}`);
  }, [api, load, navigate, vehicleClass, vehicleNumber, vehicleModel]);

  if (loading) {
    return (
      <AccountDetailScreen title="Your cars">
        <DetailSectionsSkeleton cards={3} />
      </AccountDetailScreen>
    );
  }

  const vehicles = data?.vehicles ?? [];

  return (
    <>
      <ScrollView
        // Same reason as Documents: the shell centres its Outlet, so without an
        // explicit width this scroller sizes to its content and takes every card
        // below in with it.
        className="flex-1 w-full bg-white"
        contentContainerStyle={{ paddingBottom: TAIL_PADDING, gap: 8 }}
      >
      <View className="flex-row items-center gap-2 px-4 pt-4" style={{ paddingBottom: HEADING_GAP }}>
        <BackButton onPress={() => navigate(-1)} icon="caret" className="-ml-3 -mr-3" />
        <AppText className={`text-xl font-semibold ${INK}`} style={TITLE_TRACKING}>
          Your cars
        </AppText>
      </View>

      {error ? (
        <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
          <AppText className={`text-sm ${MUTED}`}>{error}</AppText>
        </View>
      ) : null}

      <View className="mx-4 gap-2">
        {vehicles.map((vehicle) => (
          <View
            key={vehicle.id}
            className="rounded-2xl p-4"
            // Muted, the same --foreground-muted every other panel in the app sits
            // on. A car is a thing to READ here; white-on-white left the card
            // outlined onto the page rather than resting on it, and the primary ring
            // that marks the one he is driving had to fight a hairline around every
            // other card to say so.
            style={{
              backgroundColor: CARD,
              borderWidth: vehicle.isActive ? 2 : 1,
              borderColor: vehicle.isActive ? PRIMARY : HAIRLINE,
            }}
          >
            <View className="flex-row items-center gap-3">
              <View
                className="w-9 h-9 rounded-xl items-center justify-center"
                style={{ backgroundColor: 'rgba(18,18,32,0.04)' }}
              >
                <CarIcon size={18} weight="regular" color={ICON_INK} />
              </View>
              <View className="flex-1">
                <AppText numberOfLines={1} className={`font-semibold ${INK}`}>
                  {vehicle.number}
                </AppText>
                <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>
                  {vehicleClassLabel(vehicle.class)}
                  {vehicle.model ? ` · ${vehicle.model}` : ''}
                </AppText>
              </View>
            </View>

            <View className="flex-row items-center justify-between gap-2 mt-3">
              <AppText className={`flex-1 text-sm ${toneFor(vehicle.verificationStatus)}`}>
                {verificationLabel(vehicle.verificationStatus)}
                {vehicle.missing?.length ? ` · ${vehicle.missing.length} to upload` : ''}
              </AppText>
              {vehicle.isActive ? (
                <View
                  className="shrink-0 rounded-lg px-2.5 py-1"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <AppText className="text-xs font-semibold uppercase tracking-wide text-white">
                    Driving now
                  </AppText>
                </View>
              ) : null}
            </View>

            <View className="flex-row items-center gap-4 mt-3">
              <Pressable
                role="button"
                onPress={() => navigate(`/account/documents?vehicleId=${vehicle.id}`)}
                hitSlop={8}
                style={({ pressed }) => ({
                  backgroundColor: ICON_INK,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText className="text-sm font-semibold text-white">Documents</AppText>
              </Pressable>

              {!vehicle.isActive ? (
                <Pressable
                  role="button"
                  disabled={busy}
                  onPress={() => switchTo(vehicle)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    backgroundColor: ICON_INK,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: pressed || busy ? 0.6 : 1,
                  })}
                >
                  <AppText className="text-sm font-semibold text-white">Drive this one</AppText>
                </Pressable>
              ) : null}

              {/* Not offered for the car he is driving. The server refuses it too
                  — the four cached columns on his row are non-nullable and would
                  be left describing a car that no longer exists — but a button
                  that only ever produces an error is not a button. */}
              {!vehicle.isActive ? (
                <Pressable
                  role="button"
                  aria-label={`Remove ${vehicle.number}`}
                  disabled={busy}
                  onPress={() => remove(vehicle)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1, marginLeft: 'auto' })}
                >
                  <TrashIcon size={18} weight="regular" color="#92400E" />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <Pressable
        role="button"
        onPress={openAddSheet}
        className="mx-4 rounded-2xl p-4 flex-row items-center gap-3"
        style={({ pressed }) => ({
          backgroundColor: CARD,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          className="w-9 h-9 rounded-xl items-center justify-center"
          style={{ backgroundColor: WELL }}
        >
          <PlusIcon size={18} weight="bold" color={ICON_INK} />
        </View>
        <AppText className={`font-semibold ${INK}`}>Add another car</AppText>
      </Pressable>
      </ScrollView>

      <Modal
        visible={adding}
        transparent
        animationType="fade"
        onRequestClose={closeAddSheet}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: SCRIM, paddingBottom: keyboardHeight }}
          onPress={closeAddSheet}
        >
          <Pressable
            accessibilityViewIsModal
            className="bg-white rounded-t-3xl px-5 pt-5"
            style={{ maxHeight: Math.max(windowHeight - keyboardHeight - 16, 240) }}
            onPress={() => {}}
          >
            <View className="flex-row items-start gap-3 pb-4">
              <View className="flex-1 gap-1">
                <AppText className={`text-lg font-semibold ${INK}`}>Add a car</AppText>
                <AppText className={`text-sm ${MUTED}`}>
                  Choose the type, then enter the number plate and model.
                </AppText>
              </View>

              <Pressable
                role="button"
                aria-label="Close"
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
                <XIcon size={16} weight="bold" color={ICON_INK} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
            >
              <View className="gap-2">
                <AppText className={`text-sm font-semibold ${INK}`}>Car type</AppText>
                <View className="flex-row flex-wrap gap-2">
                  {CLASSES.map((option) => {
                    const selected = vehicleClass === option;
                    return (
                      <Pressable
                        key={option}
                        role="radio"
                        aria-checked={selected}
                        onPress={() => { setVehicleClass(option); setFormError(null); }}
                        className="rounded-xl px-3 py-2"
                        style={{
                          backgroundColor: selected ? ICON_INK : '#fff',
                          borderWidth: 1,
                          borderColor: selected ? ICON_INK : HAIRLINE,
                        }}
                      >
                        <AppText className={`text-sm font-semibold ${selected ? 'text-white' : INK}`}>
                          {vehicleClassLabel(option)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="gap-1">
                <AppText className={`text-sm font-semibold ${INK}`}>Number plate</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'text',
                    placeholder: 'Number plate',
                    value: vehicleNumber,
                    onChangeFn: (value: string) => {
                      setVehicleNumber(value.toUpperCase());
                      setFormError(null);
                    },
                  }}
                />
              </View>

              <View className="gap-1">
                <AppText className={`text-sm font-semibold ${INK}`}>Model</AppText>
                <Input
                  prop={{
                    variant: 'light',
                    type: 'text',
                    placeholder: 'Model',
                    value: vehicleModel,
                    onChangeFn: (value: string) => {
                      setVehicleModel(value);
                      setFormError(null);
                    },
                  }}
                />
              </View>

              <View className="pt-1">
                {formError ? (
                  <AppText className="text-sm" style={{ color: ERROR_TEXT, marginBottom: 4 }}>
                    {formError}
                  </AppText>
                ) : null}

                <Button prop={{ disabled: busy }} onPress={submitNew}>
                  {busy ? 'Adding...' : 'Add car'}
                </Button>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export default Vehicles;

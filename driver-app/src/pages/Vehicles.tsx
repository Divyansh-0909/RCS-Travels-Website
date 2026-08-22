import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { CaretLeftIcon, CarIcon, CheckCircleIcon, PlusIcon, TrashIcon } from 'phosphor-react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
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
// deliberate action on a screen he had to navigate to, with the consequence
// spelled out next to it.

const CARD = '#f3f3f3';
const HAIRLINE = 'rgba(18,18,32,0.1)';
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
// add-a-car form. What is left is the ordinary breathing room at the end of a list.
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

    setAdding(false);
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
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const vehicles = data?.vehicles ?? [];

  return (
    <ScrollView
      // Same reason as Documents: the shell centres its Outlet, so without an
      // explicit width this scroller sizes to its content and takes every card
      // below in with it.
      className="flex-1 w-full bg-white"
      contentContainerStyle={{ paddingBottom: TAIL_PADDING, gap: 8 }}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4" style={{ paddingBottom: HEADING_GAP }}>
        <Pressable
          role="button"
          aria-label="Back"
          onPress={() => navigate(-1)}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <CaretLeftIcon size={22} weight="bold" color={ICON_INK} />
        </Pressable>
        <AppText className={`text-xl font-semibold ${INK}`} style={TITLE_TRACKING}>
          Your cars
        </AppText>
      </View>

      {error ? (
        <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
          <AppText className={`text-sm ${MUTED}`}>{error}</AppText>
        </View>
      ) : null}

      {/* Only worth saying once he has more than one. With a single car the
          sentence describes a situation he is not in. */}
      {vehicles.length > 1 ? (
        <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
          <AppText className={`text-sm ${MUTED}`}>
            You take rides in the car marked &ldquo;Driving now&rdquo;. Its papers are the
            ones that decide whether you can go online — the others wait until you switch.
          </AppText>
        </View>
      ) : null}

      <View className="mx-4 gap-2">
        {vehicles.map((vehicle) => (
          <View
            key={vehicle.id}
            className="rounded-2xl p-4"
            // Muted, the same --foreground-muted every other panel in the app sits
            // on. A car is a thing to READ here; white-on-white left the card
            // outlined onto the page rather than resting on it, and the ink ring
            // that marks the one he is driving had to fight a hairline around every
            // other card to say so.
            style={{
              backgroundColor: CARD,
              borderWidth: vehicle.isActive ? 2 : 1,
              borderColor: vehicle.isActive ? ICON_INK : HAIRLINE,
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
              {vehicle.isActive ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircleIcon size={16} weight="fill" color={ICON_INK} />
                  <AppText className={`text-xs font-semibold ${INK}`}>Driving now</AppText>
                </View>
              ) : null}
            </View>

            <View className="flex-row items-center justify-between mt-3">
              <AppText className={`text-sm ${toneFor(vehicle.verificationStatus)}`}>
                {verificationLabel(vehicle.verificationStatus)}
                {vehicle.missing?.length ? ` · ${vehicle.missing.length} to upload` : ''}
              </AppText>
            </View>

            <View className="flex-row items-center gap-4 mt-3">
              <Pressable
                role="button"
                onPress={() => navigate(`/account/documents?vehicleId=${vehicle.id}`)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <AppText className={`text-sm font-semibold ${INK}`}>Documents</AppText>
              </Pressable>

              {!vehicle.isActive ? (
                <Pressable
                  role="button"
                  disabled={busy}
                  onPress={() => switchTo(vehicle)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1 })}
                >
                  <AppText className={`text-sm font-semibold ${INK}`}>Drive this one</AppText>
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

      {adding ? (
        <View className="mx-4 rounded-2xl p-4 gap-3" style={{ backgroundColor: CARD }}>
          <AppText className={`font-semibold ${INK}`}>Add a car</AppText>

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

          {/* Upper-cased on the way in rather than on submit, so what he types is
              what he checks against the plate in front of him. The server
              normalises again — this is for his eyes, not for the database. */}
          {/* variant: 'light' on both, and it is not cosmetic. Input's default is
              the dark auth shell — a white border, a translucent white fill and
              #ffffff text — so on this card the edge, the placeholder AND the
              captain's own typing were all invisible. He could fill the plate in
              perfectly and watch nothing appear. */}
          <Input
            prop={{
              variant: 'light',
              type: 'text',
              placeholder: 'Number plate',
              value: vehicleNumber,
              onChangeFn: (value: string) => { setVehicleNumber(value.toUpperCase()); setFormError(null); },
            }}
          />
          <Input
            prop={{
              variant: 'light',
              type: 'text',
              placeholder: 'Model',
              value: vehicleModel,
              onChangeFn: (value: string) => { setVehicleModel(value); setFormError(null); },
            }}
          />

          {/* Stacked, not side by side. Button's solid variant is width: '100%'
              (see its `width` line), so in a row it took the whole card and pushed
              Cancel off the right edge — and boxing it into a flex-1 only traded
              that for a full-width blue slab beside a two-word grey link, which is
              two controls on one line that agree about nothing.

              Full width each, one under the other, and the FILL is what ranks
              them: solid primary for the thing he opened the form to do, white
              fill for the way back out. Nothing here is destructive — cancelling an
              unsaved car costs him two fields — so the two being the same size is
              honest rather than dangerous. */}
          <View>
            {/* Directly above the button that produced it, where he is already
                looking. The slot holds no height when there is nothing to say —
                unlike Account's sign-out error, this one appears under the
                captain's thumb rather than under a control he is reaching for, so
                reserving the line would only be permanent empty space. */}
            {formError ? (
              <AppText className="text-sm" style={{ color: ERROR_TEXT, marginBottom: 4 }}>
                {formError}
              </AppText>
            ) : null}

            <Button prop={{ disabled: busy }} onPress={submitNew}>
              {busy ? 'Adding...' : 'Add car'}
            </Button>
            {/* The shared secondary action, not a hand-rolled Pressable. It takes its width,
                radius, padding and centring from the same component the button
                above it does, so the two cannot drift apart the way a copy of
                those numbers would. */}
            <Button
              prop={{ variant: 'secondary' }}
              onPress={() => { setAdding(false); setFormError(null); }}
            >
              Cancel
            </Button>
          </View>
        </View>
      ) : (
        <Pressable
          role="button"
          onPress={() => { setAdding(true); setFormError(null); }}
          className="mx-4 rounded-2xl p-4 flex-row items-center gap-3"
          style={({ pressed }) => ({
            backgroundColor: CARD,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: 'rgba(18,18,32,0.04)' }}
          >
            <PlusIcon size={18} weight="bold" color={ICON_INK} />
          </View>
          <AppText className={`font-semibold ${INK}`}>Add another car</AppText>
        </Pressable>
      )}
    </ScrollView>
  );
};

export default Vehicles;

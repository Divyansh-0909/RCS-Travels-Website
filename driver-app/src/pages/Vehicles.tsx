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
const BAR_CLEARANCE = 132;

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
    if (!vehicleClass) { setError('Pick the kind of car'); return; }
    if (vehicleNumber.trim().length < 4) { setError('Enter the number on the plate'); return; }

    setBusy(true);
    const result = await api.addVehicle({
      vehicleClass,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      vehicleModel: vehicleModel.trim(),
    });
    setBusy(false);

    if (result.error) { setError(result.error); return; }

    setAdding(false);
    setVehicleClass(null);
    setVehicleNumber('');
    setVehicleModel('');
    setError(null);
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
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingBottom: BAR_CLEARANCE, gap: 8 }}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4">
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
            style={{
              backgroundColor: '#fff',
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
                  onPress={() => { setVehicleClass(option); setError(null); }}
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
          <Input
            prop={{
              type: 'text',
              placeholder: 'Number plate',
              value: vehicleNumber,
              onChangeFn: (value: string) => { setVehicleNumber(value.toUpperCase()); setError(null); },
            }}
          />
          <Input
            prop={{
              type: 'text',
              placeholder: 'Model (optional)',
              value: vehicleModel,
              onChangeFn: setVehicleModel,
            }}
          />

          <View className="flex-row gap-3 items-center">
            <Button prop={{ disabled: busy }} onPress={submitNew}>
              {busy ? 'Adding...' : 'Add car'}
            </Button>
            <Pressable
              role="button"
              onPress={() => { setAdding(false); setError(null); }}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <AppText className={`text-sm ${MUTED}`}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          role="button"
          onPress={() => setAdding(true)}
          className="mx-4 rounded-2xl p-4 flex-row items-center gap-3"
          style={({ pressed }) => ({
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: HAIRLINE,
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

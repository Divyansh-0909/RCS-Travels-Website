import { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import AppText from '../AppText';

// What has to be typed in before a document can be registered: the number
// printed on it, and the date it runs out.
//
// Asked for AFTER the file is picked, never before — a captain who backs out of
// the camera should not have spent thirty seconds typing a policy number for a
// document he never sent.
//
// Its own sheet rather than the shared Input component: that one is tuned for
// the dark auth shell (white borders, translucent fills) and this page is white,
// so reusing it would mean a field with an invisible border. Same shapes and the
// same radii, resolved for a light surface.

const HAIRLINE = 'rgba(18,18,32,0.12)';
const HAIRLINE_FOCUS = 'rgba(18,18,32,0.35)';
const ERROR_BORDER = 'rgba(185,28,28,0.55)';
const WELL = 'rgba(18,18,32,0.03)';
const SCRIM = 'rgba(18,18,32,0.45)';

const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const PRIMARY = '#243AFB';
const ERROR = '#B91C1C';

type Props = {
  visible: boolean;
  label: string;
  needsNumber: boolean;
  needsExpiry: boolean;
  onCancel: () => void;
  onSubmit: (details: { number?: string; expiresAt?: string }) => void;
};

// DD/MM/YYYY as the captain types, because that is how every Indian document
// prints a date and typing it in any other order is an error waiting to happen.
// Converted to the ISO date the API takes at submit, not at keystroke.
const maskDate = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
};

/**
 * DD/MM/YYYY -> YYYY-MM-DD, or null if it is not a real date.
 *
 * The round-trip through Date is the actual validation: 31/02/2027 parses into
 * the 3rd of March, so a component that does not survive being written back is a
 * date the captain did not mean.
 */
const toIso = (masked: string): string | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));

  if (
    date.getUTCFullYear() !== Number(yyyy) ||
    date.getUTCMonth() !== Number(mm) - 1 ||
    date.getUTCDate() !== Number(dd)
  ) return null;

  return `${yyyy}-${mm}-${dd}`;
};

const DocumentDetailsSheet = ({ visible, label, needsNumber, needsExpiry, onCancel, onSubmit }: Props) => {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState(false);

  // Cleared every time the sheet opens. Without this the policy number from the
  // last document is sitting in the field for the next one, and it is exactly
  // plausible enough to be submitted.
  useEffect(() => {
    if (visible) {
      setNumber('');
      setExpiry('');
      setTouched(false);
    }
  }, [visible]);

  const iso = toIso(expiry);
  const numberBad = needsNumber && number.trim().length < 3;
  // Checked here as well as on the server, because the server's answer arrives
  // after the file has already been uploaded — this is the one that saves the
  // captain the round trip.
  const expiryBad = needsExpiry && (!iso || new Date(`${iso}T00:00:00.000Z`) <= new Date());
  const invalid = numberBad || expiryBad;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-end" style={{ backgroundColor: SCRIM }}>
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8 gap-4">
          <View className="gap-1">
            <AppText className={`text-lg font-semibold ${INK}`}>{label}</AppText>
            <AppText className={`text-sm ${MUTED}`}>
              Copy these from the document exactly as they are printed.
            </AppText>
          </View>

          {needsNumber ? (
            <View className="gap-1.5">
              <AppText className={`text-sm font-semibold ${INK}`}>Number on the document</AppText>
              <TextInput
                value={number}
                onChangeText={setNumber}
                placeholder="e.g. DL-0420110149646"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={60}
                className="w-full rounded-xl px-3.5 py-3 text-base"
                style={{
                  backgroundColor: WELL,
                  borderWidth: 1,
                  borderColor: touched && numberBad ? ERROR_BORDER : HAIRLINE,
                  color: '#121220',
                }}
              />
              {touched && numberBad ? (
                <AppText className="text-sm" style={{ color: ERROR }}>
                  Enter the number printed on the document.
                </AppText>
              ) : null}
            </View>
          ) : null}

          {needsExpiry ? (
            <View className="gap-1.5">
              <AppText className={`text-sm font-semibold ${INK}`}>Valid until</AppText>
              <TextInput
                value={expiry}
                onChangeText={(raw) => setExpiry(maskDate(raw))}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={10}
                className="w-full rounded-xl px-3.5 py-3 text-base"
                style={{
                  backgroundColor: WELL,
                  borderWidth: 1,
                  borderColor: touched && expiryBad ? ERROR_BORDER : HAIRLINE,
                  color: '#121220',
                }}
              />
              {touched && expiryBad ? (
                <AppText className="text-sm" style={{ color: ERROR }}>
                  {iso ? 'That date has already passed — check the year.' : 'Enter the date as DD/MM/YYYY.'}
                </AppText>
              ) : null}
            </View>
          ) : null}

          <View className="flex-row gap-3 mt-1">
            <Pressable
              role="button"
              onPress={onCancel}
              className="flex-1 rounded-xl py-3.5 items-center"
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: HAIRLINE_FOCUS,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <AppText className={`font-semibold ${INK}`}>Cancel</AppText>
            </Pressable>

            <Pressable
              role="button"
              onPress={() => {
                // Errors appear on the first submit, not on the first keystroke.
                // A field that turns red before it has been finished is telling
                // the captain he is wrong while he is still typing.
                setTouched(true);
                if (invalid) return;
                onSubmit({
                  ...(needsNumber ? { number: number.trim() } : {}),
                  ...(needsExpiry && iso ? { expiresAt: iso } : {}),
                });
              }}
              className="flex-1 rounded-xl py-3.5 items-center"
              style={({ pressed }) => ({
                backgroundColor: PRIMARY,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText className="font-semibold text-white">Upload</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DocumentDetailsSheet;
export { toIso, maskDate };

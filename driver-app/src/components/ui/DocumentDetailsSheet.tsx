import { useEffect, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { XIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { numberFieldFor, type DriverDocumentType } from '../../constants/documents';

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
const ERROR_BORDER = 'rgba(185,28,28,0.55)';
const WELL = 'rgba(18,18,32,0.03)';
const SCRIM = 'rgba(18,18,32,0.45)';

const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const PRIMARY = '#243AFB';
const ERROR = '#B91C1C';

type Props = {
  visible: boolean;
  /** Which document, so the number field can name what is printed on it. */
  type: DriverDocumentType;
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

const DocumentDetailsSheet = ({ visible, type, label, needsNumber, needsExpiry, onCancel, onSubmit }: Props) => {
  const numberField = numberFieldFor(type);

  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState(false);
  const [closePressed, setClosePressed] = useState(false);
  const [submitPressed, setSubmitPressed] = useState(false);

  // Measured off the keyboard itself, rather than left to KeyboardAvoidingView.
  //
  // KAV is what an ordinary screen uses and it does not work here, for two reasons
  // that compound. A Modal is a separate Android window and does not inherit the
  // activity's adjustResize, so there is nothing for KAV's Android path to lean
  // on; and its `height` behaviour works by SETTING a height, which the flex-1 it
  // needs in order to fill the screen then overrides. Reading the event and
  // padding the container has no platform behaviour left in it to be wrong about.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // The `Will` pair fires with the keyboard's own animation on iOS, so the sheet
    // travels with it rather than jumping after it has arrived. Android only has
    // the `Did` pair.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const shown = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => { shown.remove(); hidden.remove(); };
  }, []);

  // Cleared every time the sheet opens. Without this the policy number from the
  // last document is sitting in the field for the next one, and it is exactly
  // plausible enough to be submitted.
  useEffect(() => {
    if (visible) {
      setNumber('');
      setExpiry('');
      setTouched(false);
      // A sheet that closed with the keyboard up leaves its height behind, and the
      // next one would open already lifted off the bottom edge by a keyboard that
      // is not there.
      setKeyboardHeight(0);
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
      {/* The sheet is parked on the bottom edge, which is exactly where the
          keyboard arrives — so without the padding it opens over the field it was
          summoned by, and over the Upload button under that.

          Padding on the CONTAINER, not a margin on the sheet: this one is
          justify-end, so growing its bottom padding lifts the sheet by exactly the
          keyboard's height and leaves the scrim covering the whole screen. */}
      <View
        className="flex-1 justify-end"
        style={{ backgroundColor: SCRIM, paddingBottom: keyboardHeight }}
      >
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8 gap-4">
          {/* The way out, level with the title — same as the source sheet, which is
              the step immediately before this one. A full-width Cancel beside
              Upload gave equal weight to finishing and abandoning, on a sheet the
              captain only reached by choosing a file thirty seconds ago.

              items-start, so a long document name wrapping to two lines pushes the
              cross down with the top of the block rather than centring it. */}
          <View className="flex-row items-start gap-3">
            <View className="flex-1 gap-1">
              <AppText className={`text-lg font-semibold ${INK}`}>{label}</AppText>
              {/* Broken by hand, after "document". Left to itself the line runs on
                  and turns at whatever word the close button's 44pt happens to
                  leave room for, which lands mid-phrase — "exactly as they are
                  printed" is one instruction and reads as one when it holds a line
                  of its own. Both halves fit inside the narrowest column this sheet
                  has (a 360pt phone, less px-5 and the close button), so the break
                  is the only one either line takes. */}
              <AppText className={`text-sm ${MUTED}`}>
                Copy these from the document{'\n'}exactly as they are printed.
              </AppText>
            </View>

            <Pressable
              role="button"
              aria-label="Close"
              onPress={onCancel}
              onPressIn={() => setClosePressed(true)}
              onPressOut={() => setClosePressed(false)}
              // Size in POINTS, not w-8/h-8: the spacing scale is rem and
              // NativeWind's inlineRem is 14, so those would draw 28 while reading
              // as 32. hitSlop buys the rest of the 44 a thumb wants without
              // drawing a circle there is no room for beside a title.
              hitSlop={10}
              className="rounded-full items-center justify-center"
              style={{
                width: 32,
                height: 32,
                backgroundColor: WELL,
                opacity: closePressed ? 0.6 : 1,
              }}
            >
              <XIcon size={16} weight="bold" color="#121220" />
            </Pressable>
          </View>

          {needsNumber ? (
            <View className="gap-1.5">
              <AppText className={`text-sm font-semibold ${INK}`}>{numberField.label}</AppText>
              <TextInput
                value={number}
                onChangeText={setNumber}
                placeholder={numberField.placeholder}
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
              {/* Names the field it sits under, for the same reason the heading
                  does. "Enter the number printed on the document" beneath a field
                  headed "Policy number" is the app forgetting what it just asked
                  for. */}
              {touched && numberBad ? (
                <AppText className="text-sm" style={{ color: ERROR }}>
                  Enter the {numberField.label.toLowerCase()} printed on it.
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

          {/* Holds its pressed state rather than reading Pressable's style
              callback. It carries a className, and NativeWind merges an inline
              style into its own computation and understands objects and arrays
              only — a function is collected, applied, and yields nothing. This was
              losing its blue fill, which made it white text on a white sheet. See
              the note in ui/Button. */}
          <View className="mt-1">
            <Pressable
              role="button"
              onPressIn={() => setSubmitPressed(true)}
              onPressOut={() => setSubmitPressed(false)}
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
              className="w-full rounded-xl py-3.5 items-center"
              style={{
                backgroundColor: PRIMARY,
                opacity: submitPressed ? 0.85 : 1,
              }}
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

import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { CaretRightIcon, type Icon as PhosphorIcon } from 'phosphor-react-native';
import AppText from '../AppText';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Caret = cssInterop(CaretRightIcon, asThemed);

const HAIRLINE = 'rgba(18,18,32,0.1)';
const WELL = 'rgba(18,18,32,0.04)';

const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';

// The leading glyph takes a colour PROP, not a class. cssInterop is what turns a
// className into one, and it has to run at module scope against a known component —
// this one arrives as a prop, so there is nothing to interop at import time and a
// className on it would be dropped without a warning. The hex is --background-primary.
const ICON_INK = '#121220';

// The value slot's warning tone. Amber 800 rather than 700 for the reason RideRow
// gives: the 700 step lands at 4.2:1 on this page and these are 12-14px numbers a
// captain is expected to act on before his papers lapse.
const WARN = 'text-[#92400E]';

type Props = {
  label: string;
  Icon: PhosphorIcon;
  /** The right-hand detail: an account handle, a rating, "2 expiring". */
  value?: string | null;
  /** Draws the value in amber. For a value that is a thing to do, not a thing to read. */
  warn?: boolean;
  /** Absent means the row is informational rather than a control. */
  onPress?: () => void;
  /**
   * Force the caret off on a row that IS pressable. For taps that leave the app
   * entirely — WhatsApp, the share sheet — where a caret would promise a screen
   * inside this one and then hand the captain to another application.
   */
  caret?: boolean;
  /** Last row in its group draws no rule under itself. */
  last?: boolean;
};

const AccountRow = ({ label, Icon, value, warn, onPress, caret, last }: Props) => {
  const showCaret = onPress != null && caret !== false;

  const body = (
    <View className="w-full flex-row items-center gap-3 py-3.5">
      {/* The icon sits in a well rather than loose on the page. Eight bare glyphs
          down a white column read as eight separate marks; eight identical wells
          read as one list, which is what they are. */}
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: WELL }}
      >
        <Icon size={18} weight="regular" color={ICON_INK} />
      </View>

      <AppText numberOfLines={1} className={`flex-1 font-semibold ${INK}`}>
        {label}
      </AppText>

      {value ? (
        <AppText numberOfLines={1} className={`text-sm ${warn ? WARN : MUTED}`}>
          {value}
        </AppText>
      ) : null}

      {/* Drawn only where the tap opens another screen. A row that hands the captain
          to a system surface such as Share can opt out with caret={false}. */}
      {showCaret ? <Caret size={16} weight="bold" className={MUTED} /> : null}
    </View>
  );

  return (
    <View
      className="w-full"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: HAIRLINE }}
    >
      {onPress ? (
        <Pressable
          role="button"
          aria-label={value ? `${label}, ${value}` : label}
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
};

export default AccountRow;

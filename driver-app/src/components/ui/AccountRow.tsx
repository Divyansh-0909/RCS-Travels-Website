import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import {
  ArrowSquareOutIcon,
  CaretRightIcon,
  type Icon as PhosphorIcon,
} from 'phosphor-react-native';
import AppText from '../AppText';
import { useTheme } from '../../theme/ThemeContext';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Caret = cssInterop(CaretRightIcon, asThemed);
const External = cssInterop(ArrowSquareOutIcon, asThemed);

const INK = 'text-ink';
const MUTED = 'text-ink-muted';

// The leading glyph takes a colour PROP, not a class. cssInterop is what turns a
// className into one, and it has to run at module scope against a known component —
// this one arrives as a prop, so there is nothing to interop at import time and a
// className on it would be dropped without a warning. The hex is --background-primary.

// The value slot's warning tone. Amber 800 rather than 700 for the reason RideRow
// gives: the 700 step lands at 4.2:1 on this page and these are 12-14px numbers a
// captain is expected to act on before his papers lapse.
const WARN = 'text-[#92400E]';

type Props = {
  label: string;
  /** Optional secondary line for context that should remain attached to the row. */
  detail?: string | null;
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
  /** Marks a tap that opens a system or website surface. */
  external?: boolean;
  /** Rotates the navigation caret down for an expanded inline section. */
  expanded?: boolean;
  /** Reserved for genuinely destructive or emergency actions. */
  tone?: 'default' | 'danger';
  /** Last row in its group draws no rule under itself. */
  last?: boolean;
  /**
   * Account-page menu treatment: each row owns its themed panel, while the parent
   * supplies the narrow gap and clips only the group's outer corners.
   */
  grouped?: boolean;
};

const AccountRow = ({
  label,
  detail,
  Icon,
  value,
  warn,
  onPress,
  caret,
  external,
  expanded = false,
  tone = 'default',
  last,
  grouped = false,
}: Props) => {
  const { colors } = useTheme();
  const showExternal = onPress != null && external === true;
  const showCaret = onPress != null && caret !== false && !showExternal;
  const danger = tone === 'danger';
  const caretTurn = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    caretTurn.value = withTiming(expanded ? 1 : 0, {
      duration: 200,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [expanded, caretTurn]);

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${caretTurn.value * 90}deg` }],
  }));

  const body = (
    <View className={`w-full flex-row items-center gap-3 py-3.5 ${grouped ? 'px-4' : ''}`}>
      <View
        className={`${grouped ? 'w-8 h-8' : 'w-9 h-9 rounded-xl'} items-center justify-center`}
        style={grouped ? undefined : { backgroundColor: danger ? 'rgba(185,28,28,0.08)' : colors.surfaceRaised }}
      >
        <Icon
          size={grouped ? 26 : 18}
          weight={grouped ? 'fill' : 'regular'}
          color={danger ? colors.negative : colors.ink}
        />
      </View>

      <View className="flex-1">
        <AppText
          numberOfLines={detail || (grouped && value) ? 2 : 1}
          className={`${grouped ? 'text-base ' : ''}font-semibold ${danger ? 'text-[#B91C1C]' : INK}`}
        >
          {label}
        </AppText>
        {detail ? (
          <AppText numberOfLines={2} className={`text-sm mt-0.5 ${MUTED}`}>
            {detail}
          </AppText>
        ) : null}
        {grouped && value ? (
          <AppText numberOfLines={1} className={`text-sm mt-0.5 ${warn ? WARN : MUTED}`}>
            {value}
          </AppText>
        ) : null}
      </View>

      {value && !grouped ? (
        <AppText numberOfLines={1} className={`text-sm ${warn ? WARN : MUTED}`}>
          {value}
        </AppText>
      ) : null}

      {/* Drawn only where the tap opens another screen. A row that hands the captain
          to a system surface such as Share can opt out with caret={false}. */}
      {showCaret ? (
        <Animated.View style={caretStyle}>
          <Caret size={16} weight="bold" className={MUTED} />
        </Animated.View>
      ) : null}
      {showExternal ? <External size={17} weight="bold" className={MUTED} /> : null}
    </View>
  );

  return (
    <View
      className="w-full"
      style={grouped
        ? { backgroundColor: colors.surfaceMuted }
        : last
          ? undefined
          : { borderBottomWidth: 1, borderBottomColor: colors.borderUi }}
    >
      {onPress ? (
        <Pressable
          role="button"
          aria-label={[label, detail, value].filter(Boolean).join(', ')}
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

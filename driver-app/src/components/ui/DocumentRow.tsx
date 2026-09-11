import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusCircleIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  XCircleIcon,
} from 'phosphor-react-native';
import AppText from '../AppText';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Retry = cssInterop(ArrowClockwiseIcon, asThemed);

const HAIRLINE = 'rgba(18,18,32,0.1)';
const WELL = 'rgba(18,18,32,0.04)';
const TRACK = 'rgba(18,18,32,0.08)';

const INK = 'text-ink';
const MUTED = 'text-ink-muted';


/**
 * The state of one document, as the captain reads it. Not the same vocabulary as
 * the server's two columns — this is the two of them collapsed into the single
 * answer to "what, if anything, do I have to do about this one".
 */
export type DocumentRowState =
  | 'missing'
  | 'uploading'
  | 'scanning'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'unverified';

type Props = {
  label: string;
  state: DocumentRowState;
  required: boolean;
  /** The admin's words on a rejection, or the one generic line on a failed scan. */
  reason?: string | null;
  /** "Expires in 24 days", "Expired", or null. */
  expiry?: string | null;
  /** True when the expiry is inside the warning window or already past. */
  expiryWarn?: boolean;
  /** 0-1 while uploading. Anything else is ignored. */
  progress?: number;
  /** A renewal for this type is already in flight — see the note below. */
  renewing?: boolean;
  onPress?: () => void;
  onRetry?: () => void;
  last?: boolean;
};

const presentationFor = (colors: ThemeColors): Record<DocumentRowState, { Icon: typeof ClockIcon; color: string; word: string }> => ({
  missing: { Icon: PlusCircleIcon, color: colors.ink, get "word"() { return dc("Not uploaded"); } },
  uploading: { Icon: ClockIcon, color: colors.primary, word: 'Uploading' },
  // The file check, in the captain's words. He is not told it is a security scan
  // — that invites him to wonder what was suspected of his licence — only that it
  // is being checked, which is true and is all he can act on.
  scanning: { Icon: ShieldCheckIcon, color: colors.primary, word: 'Checking' },
  pending: { Icon: ClockIcon, color: colors.warning, get "word"() { return dc("Waiting for review"); } },
  approved: { Icon: CheckCircleIcon, color: colors.positive, get "word"() { return dc("Approved"); } },
  rejected: { Icon: XCircleIcon, color: colors.negative, get "word"() { return dc("Rejected"); } },
  // A scan that could not be completed. Deliberately worded as a problem with
  // the file rather than a verdict on the driver — most of these are a truncated
  // upload over bad signal, not anybody trying anything.
  unverified: { Icon: WarningCircleIcon, color: colors.negative, get "word"() { return dc("Couldn't be checked"); } },
});

const DocumentRow = ({
  label,
  state,
  required,
  reason,
  expiry,
  expiryWarn,
  progress,
  renewing,
  onPress,
  onRetry,
  last,
}: Props) => {
    useCopyLanguage();
  const { colors } = useTheme();
  const { Icon, color, word } = presentationFor(colors)[state];
  const showProgress = state === 'uploading' && typeof progress === 'number';
  const showRetry = (state === 'rejected' || state === 'unverified') && onRetry != null;

  const body = (
    <View className="w-full flex-row items-center gap-3 py-3.5">
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: WELL }}
      >
        <Icon size={18} weight="regular" color={color} />
      </View>

      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <AppText numberOfLines={1} className={`font-semibold ${INK}`}>
            {label}
          </AppText>
          {/* Marked on the ones that can hold up an approval, not on the ones
              that cannot. A captain with a petrol car should not spend a second
              wondering about the CNG certificate. */}
          {required ? null : (
            <AppText className={`text-xs ${MUTED}`}>{dc("Optional")}</AppText>
          )}
        </View>

        <AppText numberOfLines={2} className="text-sm" style={{ color }}>
          {word}
        </AppText>

        {/* The admin's own sentence, verbatim. "Photo is blurry" is exactly what
            he needs and exactly what it was written for. */}
        {reason ? (
          <AppText numberOfLines={3} className={`text-sm ${MUTED}`}>
            {reason}
          </AppText>
        ) : null}

        {expiry ? (
          <AppText className="text-sm" style={{ color: expiryWarn ? colors.warning : colors.inkMuted }}>
            {expiry}
          </AppText>
        ) : null}

        {/* Said out loud, because otherwise an approved row with a renewal
            already sent looks exactly like an approved row with nothing done —
            and the captain uploads his insurance a second time. */}
        {renewing ? (
          <AppText className="text-sm" style={{ color: colors.primary }}>{dc("Renewal sent — being checked")}</AppText>
        ) : null}

        {showProgress ? (
          <View
            className="h-1 w-full rounded-full mt-1 overflow-hidden"
            style={{ backgroundColor: TRACK }}
          >
            <View
              className="h-full rounded-full"
              style={{ backgroundColor: colors.primary, width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </View>
        ) : null}
      </View>

      {showRetry ? (
        <Pressable
          role="button"
          aria-label={dc("Retry {{value0}}", {value0: (label)})}
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Retry size={18} weight="bold" color={colors.ink} />
        </Pressable>
      ) : null}
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
          aria-label={dc("{{value0}}, {{value1}}", {value0: (label), value1: (word)})}
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

export default DocumentRow;

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

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Retry = cssInterop(ArrowClockwiseIcon, asThemed);

const HAIRLINE = 'rgba(18,18,32,0.1)';
const WELL = 'rgba(18,18,32,0.04)';
const TRACK = 'rgba(18,18,32,0.08)';

const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';

const ICON_INK = '#121220';
// Amber 800 rather than 700, for the reason AccountRow gives: 700 lands at 4.2:1
// on this page and these are 12-14px lines a captain is meant to act on.
const AMBER = '#92400E';
const GREEN = '#15803D';
const RED = '#B91C1C';
const BLUE = '#243AFB';

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

const PRESENTATION: Record<DocumentRowState, { Icon: typeof ClockIcon; color: string; word: string }> = {
  missing: { Icon: PlusCircleIcon, color: ICON_INK, word: 'Not uploaded' },
  uploading: { Icon: ClockIcon, color: BLUE, word: 'Uploading' },
  // The file check, in the captain's words. He is not told it is a security scan
  // — that invites him to wonder what was suspected of his licence — only that it
  // is being checked, which is true and is all he can act on.
  scanning: { Icon: ShieldCheckIcon, color: BLUE, word: 'Checking' },
  pending: { Icon: ClockIcon, color: AMBER, word: 'Waiting for review' },
  approved: { Icon: CheckCircleIcon, color: GREEN, word: 'Approved' },
  rejected: { Icon: XCircleIcon, color: RED, word: 'Rejected' },
  // A scan that could not be completed. Deliberately worded as a problem with
  // the file rather than a verdict on the driver — most of these are a truncated
  // upload over bad signal, not anybody trying anything.
  unverified: { Icon: WarningCircleIcon, color: RED, word: "Couldn't be checked" },
};

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
  const { Icon, color, word } = PRESENTATION[state];
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
            <AppText className={`text-xs ${MUTED}`}>Optional</AppText>
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
          <AppText className="text-sm" style={{ color: expiryWarn ? AMBER : '#4B5563' }}>
            {expiry}
          </AppText>
        ) : null}

        {/* Said out loud, because otherwise an approved row with a renewal
            already sent looks exactly like an approved row with nothing done —
            and the captain uploads his insurance a second time. */}
        {renewing ? (
          <AppText className="text-sm" style={{ color: BLUE }}>
            Renewal sent — being checked
          </AppText>
        ) : null}

        {showProgress ? (
          <View
            className="h-1 w-full rounded-full mt-1 overflow-hidden"
            style={{ backgroundColor: TRACK }}
          >
            <View
              className="h-full rounded-full"
              style={{ backgroundColor: BLUE, width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </View>
        ) : null}
      </View>

      {showRetry ? (
        <Pressable
          role="button"
          aria-label={`Retry ${label}`}
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Retry size={18} weight="bold" color={ICON_INK} />
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
          aria-label={`${label}, ${word}`}
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

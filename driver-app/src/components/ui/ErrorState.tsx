import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { WarningIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import Button from './Button';
import { INK_TEXT, MUTED } from './rideUi';

// The one way this app says something went wrong and cannot fix itself.
//
// Presentational only — it knows nothing about what failed, who is retrying, or
// whether a retry is even possible. That is what lets the same block serve a board
// whose first page never arrived and a screen that threw while rendering: two very
// different failures that a captain standing beside his car experiences identically.
//
// Deliberately NOT the inline banner. A banner belongs over content that is still
// there and still true; this belongs where the content should have been. Rides draws
// both, and which one it draws is exactly the question of whether it has anything to
// show underneath.

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Warning = cssInterop(WarningIcon, asThemed);

// Button's own error wash, at the same value. The mark is not a status pill and does
// not take a solid fill: a solid negative circle at 64px is an alarm, and most of what
// lands here is a dropped connection on a campus road.
const WASH = 'rgba(185,28,28,0.1)';

type Props = {
    /** What happened, in the captain's terms. Sentence case, no apology, no full stop. */
    title: string;
    /** Why, or what to do about it. The raw server message is acceptable here. */
    message?: string | null;
    actionLabel?: string;
    onAction?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
};

const ErrorState = ({
    title,
    message,
    actionLabel = 'Try again',
    onAction,
    secondaryLabel,
    onSecondary,
}: Props) => (
    <View className="flex-1 w-full items-center justify-center gap-1 px-6 pb-24" role="alert">
        <View
            className="w-16 h-16 rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: WASH }}
        >
            <Warning size={28} weight="bold" className="text-negative" />
        </View>

        <AppText className={`text-lg font-semibold text-center ${INK_TEXT}`}>
            {title}
        </AppText>

        {/* Three lines is the ceiling. Past that it is a stack trace wearing a sentence,
            and the captain's next move is the button either way. */}
        {message ? (
            <AppText numberOfLines={3} className={`text-sm text-center ${MUTED}`}>
                {message}
            </AppText>
        ) : null}

        {onAction && (
            <Button prop={{ width: 190 }} className="mt-5" onPress={onAction}>
                {actionLabel}
            </Button>
        )}

        {onSecondary && secondaryLabel && (
            <Pressable
                role="button"
                onPress={onSecondary}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
                <AppText className={`text-sm font-semibold mt-1 ${MUTED}`}>{secondaryLabel}</AppText>
            </Pressable>
        )}
    </View>
);

export default ErrorState;

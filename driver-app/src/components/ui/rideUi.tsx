import type { ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle , SharedValue } from 'react-native-reanimated';

import { cssInterop } from 'nativewind';
import { PhoneIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import BackButton from './BackButton';
import { splitAddress } from '../../constants/booking';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
export const Phone = cssInterop(PhoneIcon, asThemed);

// Copied into the app's own assets rather than reached for across the package
// boundary. Metro bundles what it watches, and this config adds no watchFolders — a
// require() into frontend/src would resolve at type-check time and fail at bundle time.
export const WhatsappLogo = require('../../../assets/whatsapp-logo.webp');

export const PAGE = '#f3f3f3';                   // --foreground-muted
export const SURFACE = '#ffffff';                // --foreground
export const INK = '#121220';                    // --background-primary
export const HAIRLINE = 'rgba(18,18,32,0.1)';

export const INK_TEXT = 'text-[var(--background-primary)]';
export const MUTED = 'text-gray-600';
export const CONTENT = 'text-black';

// The primary line of a section: the thing a captain actually reads, as opposed to the
// label naming it or the small print qualifying it. A place name and a fare line are the
// same kind of thing to him, so they are set once here.
export const PRIMARY_LINE = `text-base font-semibold ${CONTENT}`;

/**
 * Persistent chrome for the ride and marketplace detail screens. It deliberately
 * lives outside their ScrollViews so the captain never loses the page title or the
 * way back while reading a long fare breakdown.
 */
export const DetailPageHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <View className="w-full flex-row items-center gap-2 px-4" style={{ backgroundColor: PAGE }}>
        <BackButton onPress={onBack} iconClassName={INK_TEXT} />
        <AppText className={`text-xl font-semibold ${INK_TEXT}`} style={{ letterSpacing: -0.72 }}>
            {title}
        </AppText>
    </View>
);

// The status pill's fill says which KIND of state the ride is in rather than which
// state exactly — the three working statuses share a colour because the word on the
// pill already separates them, and six fills would make a list into a colour chart.
// White clears 6.4:1 on the tightest of these, so every pill is AA at 12px.
const STATUS_FILLS: Record<string, string> = {
    assigned: INK,
    en_route: '#243AFB',
    reached: '#243AFB',
    started: '#243AFB',
    completed: '#166534',
    cancelled: '#B91C1C',
};

// Ink for anything unrecognised: a status the app has not been taught still has to
// draw, and the neutral is the one fill that claims nothing about it.
export const statusFill = (status: string) => STATUS_FILLS[status] ?? INK;

// Payment as a sentence rather than a chip. The colours that used to sit beside this
// have gone with the words they dressed: the detail screen banners this across the head
// of its card now and pairs its own ink to its own fill, which is a decision that cannot
// be made one half at a time. DetailStatusBanner owns those pairs below.
export const paymentWords = (state: 'paid' | 'due' | 'void') =>
    state === 'paid' ? 'Paid' : state === 'void' ? 'No charge' : 'Payment due';

export type DetailStatusTone = 'primary' | 'warning' | 'danger' | 'success' | 'neutral';

// One banner language for both ride and marketplace detail screens. Each pair clears
// AA at the 12px label size; the pale fills keep status visible without turning the
// whole booking card into an alert. Cancelled/no-charge uses neutral because there is
// no action left to take, while danger stays reserved for money that is still owed.
const DETAIL_STATUS_TONES: Record<DetailStatusTone, { fill: string; ink: string }> = {
    primary: { fill: 'rgba(36,58,251,0.12)', ink: 'text-primary' },
    warning: { fill: '#FEF3C7', ink: 'text-[#92400E]' },
    danger: { fill: '#FADCD8', ink: 'text-[#991B1B]' },
    success: { fill: '#DCF0E3', ink: 'text-[#166534]' },
    neutral: { fill: '#E8E8EC', ink: 'text-[#4B5563]' },
};

export const DetailStatusBanner = ({ label, tone }: { label: string; tone: DetailStatusTone }) => {
    const colours = DETAIL_STATUS_TONES[tone];

    return (
        <View
            className="w-full items-center py-2"
            style={{
                backgroundColor: colours.fill,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
            }}
        >
            <AppText className={`text-xs font-semibold uppercase tracking-wide ${colours.ink}`}>
                {label}
            </AppText>
        </View>
    );
};

// ---------------------------------------------------------------------------

// Pickup is a solid dark dot, drop is a primary ring — two shapes rather than two
// colours, so the pair still says which end is which to anyone who cannot separate them.
const RouteDot = ({ drop }: { drop?: boolean }) =>
    drop ? (
        <View className="w-3 h-3 rounded-full bg-primary items-center justify-center">
            {/* Centred by flex rather than absolute + translate: RN has no percentage
                transforms, and a hole punched in a ring only has to be in the middle. */}
            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SURFACE }} />
        </View>
    ) : (
        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: INK }} />
    );

/**
 * One end of the trip, split at the first comma. The first field is the only part read
 * at a glance — "IGI Airport Terminal 3" is the job, "New Delhi" is where everyone
 * already knows it is — so it takes the size and the black, and the rest drops to muted.
 *
 * items-center: the dot marks the leg, not the first line of it.
 */
export const RouteLeg = ({ address, drop }: { address: string; drop?: boolean }) => {
    const { main, rest } = splitAddress(address);

    return (
        <View className="flex-row items-center gap-3">
            <RouteDot drop={drop} />
            <View className="flex-1">
                <AppText numberOfLines={1} className={PRIMARY_LINE}>{main}</AppText>
                {rest ? (
                    <AppText numberOfLines={2} className={`text-sm ${MUTED}`}>{rest}</AppText>
                ) : null}
            </View>
        </View>
    );
};

/**
 * A small fact wearing a pill — distance, duration. Same treatment as the rating pill
 * on Account, down to the padding: 6 POINTS rather than a p-* class, because the
 * spacing scale is rem and the steps around here land under 2px apart, which is not a
 * visible change on a phone and reads as the class having done nothing.
 *
 * Text only. The rating pill has a star because a bare "4.8" says nothing on its own;
 * "24 km" and "~39 min" carry their own units, so a road and a clock beside them were
 * labelling what the label already said. Horizontal padding is a touch wider than the
 * vertical to make up for the mark that used to hold that edge.
 */
export const FactPill = ({ children }: { children: ReactNode }) => (
    <View
        className="rounded-xl"
        style={{ backgroundColor: PAGE, paddingVertical: 6, paddingHorizontal: 10 }}
    >
        <AppText className={`text-sm font-semibold ${INK_TEXT}`}>{children}</AppText>
    </View>
);

/**
 * `leading` is a node, not an icon component: one of these buttons is fronted by a
 * phosphor glyph that takes its colour from the button, the other by a fixed brand mark
 * that must not. A component prop would have forced the image to pretend it was an icon.
 *
 * Both variants are filled — ink for the primary, --foreground for the secondary. The
 * secondary used to be transparent with a hairline round it, which put an outline on
 * the one surface on these screens that is otherwise borderless; filled, it sits on the
 * page tint the same way the cards above it do, and the border goes with the job it was doing.
 *
 * When `progress` is provided, the button uses primary-muted as its base and a primary
 * layer fills it from left to right according to the timer.
 */
export const ActionButton = ({
    label,
    leading,
    onPress,
    solid,
    tone = 'default',
    disabled = false,
    padY = 'py-3',
    size = 'default',
    progress,
}: {
    label: string;
    leading: ReactNode;
    onPress: () => void;
    solid?: boolean;
    tone?: 'default' | 'danger';
    disabled?: boolean;
    padY?: string;
    size?: 'default' | 'large';
    progress?: SharedValue<number>;
}) => {
    const large = size === 'large';
    const danger = tone === 'danger';
    const progressStyle = useAnimatedStyle(() => ({
        width: progress ? `${progress.value * 100}%` : '100%',
    }));

    return (
        <Pressable
            role="button"
            onPress={onPress}
            disabled={disabled}
            aria-disabled={disabled}
            className="flex-1"
            style={{ flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0, opacity: disabled ? 0.45 : 1 }}
        >
            <View
                className={`relative flex-row items-center justify-center overflow-hidden ${large ? 'gap-2 py-3.5' : `gap-1 ${padY}`} ${
                    progress
                        ? 'bg-primary-light'
                        : danger
                            ? 'bg-negative'
                        : solid
                            ? 'bg-[var(--background-primary)]'
                            : 'bg-[var(--foreground)]'
                }`}
                style={{
                    borderRadius: large ? 16 : 12,
                }}
            >
                {progress && (
                    <Animated.View
                        pointerEvents="none"
                        className="absolute left-0 top-0 bottom-0 bg-primary"
                        style={progressStyle}
                    />
                )}

                <View className={`z-10 flex-row items-center justify-center ${large ? 'gap-2' : 'gap-1'}`}>
                    {leading}
                    <AppText
                        className={`${large ? 'text-base' : 'text-sm'} font-semibold ${
                            solid || progress || danger ? 'text-white' : INK_TEXT
                        }`}
                    >
                        {label}
                    </AppText>
                </View>
            </View>
        </Pressable>
    );
};

/** The two marks the action buttons are fronted by, so both call sites agree on size. */
export const PhoneMark = () => (
    <Phone size={18} weight="fill" className="text-[var(--foreground)]" />
);

export const WhatsappMark = () => (
    // 24 against the phone glyph's 18, which is not the mismatch it looks like: the artwork
    // has transparent margin baked in, so the circle inside this box draws to about what an
    // 18pt icon does. Sized to what reads, not to what the numbers say.
    <Image
        source={WhatsappLogo}
        style={{ width: 24, height: 24 }}
        accessibilityIgnoresInvertColors
    />
);

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { cssInterop } from 'nativewind';
import { ArrowLeftIcon, CheckIcon, CopyIcon } from 'phosphor-react-native';
import { useNavigate, useParams } from 'react-router-native';
import AppText from '../components/AppText';
import {
    ActionButton,
    CONTENT,
    DetailStatusBanner,
    FactPill,
    HAIRLINE,
    INK,
    INK_TEXT,
    MUTED,
    PAGE,
    PhoneMark,
    RouteLeg,
    SURFACE,
    WhatsappMark,
    paymentWords,
} from '../components/ui/rideUi';
import { useApi } from '../hooks/useApi';
import { UpcomingBooking } from '../types/enums';
import {
    fareBreakdown,
    fareUnpaid,
    formatDateTime,
    formatDistance,
    formatDuration,
    initials,
    isFinished,
    rideDuration,
    rupees,
    vehicleLabel,
} from '../constants/booking';
import { openSupportWhatsApp } from '../constants/support';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Back = cssInterop(ArrowLeftIcon, asThemed);
const Copy = cssInterop(CopyIcon, asThemed);
const Check = cssInterop(CheckIcon, asThemed);

// The shell pads every non-home route down by pt-10 to clear the status bar. This
// screen owns its own background, and a page tinted from 40px down with white above it
// reads as a rendering fault rather than as a header — so it bleeds up through that
// padding and puts the space back as padding of its own. The two numbers are the same
// number and have to stay that way; App.tsx is where it is set.
const SHELL_TOP_PAD = 40;

// One step down from PRIMARY_LINE, which the addresses keep. The summary is a column of
// paired label-and-figure rows, so it reads as a table and a table does not need each
// row set at reading size — the total under the rule is what the eye is going to, and
// dropping the lines a step is what lets it get there.
const FARE_LINE = `text-sm font-semibold ${CONTENT}`;

type ApiError = { error: string; status: number; code?: string };
type GetRideResponse = UpcomingBooking | ApiError;

const PaymentBanner = ({ state }: { state: UpcomingBooking['paymentState'] }) => (
    <DetailStatusBanner
        label={paymentWords(state)}
        tone={state === 'due' ? 'danger' : state === 'paid' ? 'success' : 'neutral'}
    />
);

// gap-4 is the card's own rhythm: the top card stacks whole blocks — a heading, a
// route, a rider — and they need the air to stay separate. The summary card stacks
// rows of one table, which do not, so it passes its own.
//
// The padding sits on an inner view rather than on the card, so a banner passed in can
// reach both edges of it.
const Card = ({ children, gap = 'gap-4', banner }: {
    children: React.ReactNode;
    gap?: string;
    banner?: React.ReactNode;
}) => (
    <View className="w-full rounded-2xl" style={{ backgroundColor: SURFACE }}>
        {banner}
        <View className={`p-5 ${gap}`}>{children}</View>
    </View>
);

const Label = ({ children }: { children: React.ReactNode }) => (
    <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
        {children}
    </AppText>
);

const RideDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const api = useApi();

    const [booking, setBooking] = useState<UpcomingBooking | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Same reason as the Rides board: useApi memoises on Clerk's getToken, which is not
    // promised to keep its identity, and a refresh that re-ran on every render would
    // strand the loading state. Read through a ref so `load` is stable.
    const apiRef = useRef(api);
    apiRef.current = api;

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const data = await apiRef.current.getRide(id) as GetRideResponse;
            if ('error' in data) setError(data.error);
            else setBooking(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const copyId = async () => {
        if (!booking) return;
        // The same value the screen is showing. Short enough to retype now, but the
        // button stays: text in React Native is not selectable, and a mistyped digit
        // in a support chat costs more than the button does.
        await Clipboard.setStringAsync(booking.reference);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const header = (
        <View className="flex-row items-center gap-3">
            <Pressable
                role="button"
                aria-label="Back"
                onPress={() => navigate(-1)}
                hitSlop={12}
                className="w-9 h-9 items-center justify-center"
            >
                <Back size={22} weight="bold" className={INK_TEXT} />
            </Pressable>
            <AppText className={`text-xl font-semibold ${INK_TEXT}`} style={{ letterSpacing: -0.72 }}>
                Ride details
            </AppText>
        </View>
    );

    if (loading || !booking) {
        return (
            <View
                className="flex-1 w-full px-5 gap-4"
                style={{ backgroundColor: PAGE, marginTop: -SHELL_TOP_PAD, paddingTop: SHELL_TOP_PAD }}
            >
                {header}
                <View className="flex-1 items-center justify-center pb-24 gap-3">
                    {error ? (
                        <>
                            <AppText className="text-sm text-center text-red-600">{error}</AppText>
                            <Pressable role="button" onPress={load} hitSlop={8}>
                                <AppText className="text-sm font-semibold text-primary">Try again</AppText>
                            </Pressable>
                        </>
                    ) : (
                        <ActivityIndicator color={INK} />
                    )}
                </View>
            </View>
        );
    }

    const { lines, total, totalLabel } = fareBreakdown(booking);
    const { minutes, estimated } = rideDuration(booking);
    const rider = booking.user?.name ?? 'Rider';
    const when = booking.completedAt ?? booking.scheduledAt;

    return (
        <View
            className="flex-1 w-full"
            style={{ backgroundColor: PAGE, marginTop: -SHELL_TOP_PAD, paddingTop: SHELL_TOP_PAD }}
        >
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingBottom: 16,
                    gap: 16,
                }}
                showsVerticalScrollIndicator={false}
            >
                {header}

                {/* The banner only on a ride that has actually happened — see
                    isFinished. "Payment due" on a job the captain is on his way to is
                    stating the obvious as a problem, and saying it on every ride is what
                    would stop him reading it on the one where he is genuinely owed. An
                    unfinished ride gets no banner and shows the card's own top edge.

                    Red is spent here and nowhere else on the screen, which is what lets
                    it mean "still owed" rather than just "look here". */}
                <Card banner={isFinished(booking) ? <PaymentBanner state={booking.paymentState} /> : null}>
                    <View className="gap-1">
                        {/* The title has the row to itself now that the payment words
                            head the card. It keeps numberOfLines: "Premium SUV Ride" is
                            the longest this gets and it fits, but a vehicle class added
                            later should truncate rather than push the fare down. */}
                        <AppText
                            numberOfLines={1}
                            className={`text-2xl font-semibold ${INK_TEXT}`}
                            style={{ letterSpacing: -0.5 }}
                        >
                            {vehicleLabel(booking.vehicleClass)} Ride
                        </AppText>
                        <AppText className={`text-sm ${MUTED}`}>
                            {when ? formatDateTime(when) : 'Immediate pickup'}
                        </AppText>
                        {/* No "(est.)" beside it. The fare was quoted when the ride was
                            booked and is the figure the rider is held to — calling it an
                            estimate would tell a captain the amount he collects is
                            still moving, which it is not. The DURATION is the estimate,
                            and it says so with a ~ on its own pill. */}
                        <AppText className={`text-3xl font-semibold ${CONTENT}`} style={{ letterSpacing: -0.9 }}>
                            {rupees(booking.fare)}
                        </AppText>
                    </View>

                    <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

                    <View className="gap-1">
                        <Label>Ride ID</Label>
                        <View className="flex-row items-center gap-2">
                            {/* No flex-1: the reference sizes to its own ten characters,
                                so the button that copies it sits against its end rather
                                than out at the card's edge with a hand's width of nothing
                                in between. The uuid needed flex-1 to wrap; this does not,
                                and the row's gap-2 is the whole spacing rule now. */}
                            <AppText className={`text-sm font-semibold ${INK_TEXT}`}>
                                {booking.reference}
                            </AppText>
                            <Pressable
                                role="button"
                                aria-label="Copy ride ID"
                                onPress={copyId}
                                hitSlop={10}
                                className="flex-row items-center gap-1"
                            >
                                {copied ? (
                                    <>
                                        <Check size={14} weight="bold" className="text-[#166534]" />
                                        <AppText className="text-xs font-semibold text-[#166534]">Copied</AppText>
                                    </>
                                ) : (
                                    <Copy size={15} weight="regular" className={MUTED} />
                                )}
                            </Pressable>
                        </View>
                    </View>

                    <View className="gap-3">
                        <RouteLeg address={booking.pickupAddress} />
                        <RouteLeg address={booking.dropAddress} drop />
                    </View>

                    {/* Indented to the addresses above rather than to the card, so the
                        two facts read as belonging to the route and not to the ride. */}
                    {/* Not on a cancelled ride. Nobody drove it, so there is no time to
                        report, and the distance is a route that was planned rather than
                        covered — two numbers describing a journey that did not happen. */}
                    {booking.status !== 'cancelled' && (
                        <View className="flex-row items-center gap-2 pl-6">
                            <FactPill>
                                {minutes == null ? '—' : `${estimated ? '~' : ''}${formatDuration(minutes)}`}
                            </FactPill>
                            <FactPill>{formatDistance(booking.distanceKm)}</FactPill>
                        </View>
                    )}

                    {/* Gone once the ride is paid for. The rider's name is on this screen
                        so the captain can tell who he is meeting and who still owes him;
                        settled, it is somebody's name sitting in an app for no reason.
                        The Call rider button already leaves on the same terms — see
                        fareUnpaid at the foot of the screen — so this is the block
                        catching up with the action it belonged to.

                        Paid only, not "nothing owed": a no-charge ride can still be one
                        the captain is on his way to drive. */}
                    {booking.paymentState !== 'paid' && (
                        <View
                            className="w-full flex-row items-center gap-3 rounded-2xl p-3"
                            style={{ backgroundColor: INK }}
                        >
                            <View
                                className="w-11 h-11 rounded-full items-center justify-center"
                                style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
                            >
                                <AppText className="text-base font-semibold text-white">
                                    {initials(booking.user?.name ?? null)}
                                </AppText>
                            </View>
                            <View className="flex-1">
                                <AppText numberOfLines={1} className="text-base font-semibold text-white">
                                    {rider}
                                </AppText>
                                <AppText className="text-xs text-[rgba(255,255,255,0.7)]">Rider</AppText>
                            </View>
                        </View>
                    )}
                </Card>

                <View className="gap-2">
                    <View className="px-1"><Label>Ride summary</Label></View>
                    <Card gap="gap-3">
                        {/* The rows are one table and take a tighter gap than the card's,
                            grouped so the number is theirs and not every child's: at the
                            card's own spacing four lines read as four announcements, and
                            a line carrying a note put more space between a label and its
                            own footnote than between two unrelated figures. */}
                        <View className="gap-2">
                            {lines.map((line) => (
                                <View key={line.label} className="flex-row items-start justify-between gap-3">
                                    <View className="flex-1">
                                        <AppText className={FARE_LINE}>{line.label}</AppText>
                                        {line.note ? (
                                            <AppText className={`text-xs ${MUTED}`}>{line.note}</AppText>
                                        ) : null}
                                    </View>
                                    <AppText className={FARE_LINE}>{rupees(line.amount)}</AppText>
                                </View>
                            ))}
                        </View>

                        <View className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />

                        <View className="flex-row items-center justify-between gap-3">
                            <AppText className={`text-xl font-semibold ${INK_TEXT}`}>{totalLabel}</AppText>
                            <AppText className={`text-xl font-semibold ${INK_TEXT}`}>{rupees(total)}</AppText>
                        </View>
                    </Card>
                </View>
            </ScrollView>

            {/* This footer owns real layout space and an opaque surface. The details
                viewport therefore ends above it instead of scrolling behind the actions. */}
            <View
                className="w-full flex-row gap-2 px-5 pt-3 pb-6"
                style={{ backgroundColor: PAGE }}
            >
                {fareUnpaid(booking) && (
                    <ActionButton
                        label="Call rider"
                        leading={<PhoneMark />}
                        solid
                        size="large"
                        onPress={() => Linking.openURL(`tel:${booking.customerPhone}`)}
                    />
                )}
                <ActionButton
                    label="Contact support"
                    leading={<WhatsappMark />}
                    size="large"
                    onPress={() => openSupportWhatsApp(`Hi, I need help with ride ${booking.reference}.`)}
                />
            </View>
        </View>
    );
};

export default RideDetail;

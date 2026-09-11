import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, AppState, Pressable, SectionList, TextInput, View, type SectionListProps } from 'react-native';
import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import { MagnifyingGlassIcon, XIcon } from 'phosphor-react-native';
import { useLocation, useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import { useHideAppBarOnScroll } from '../components/AppBarVisibility';
import RideRow from '../components/ui/RideRow';
import RidesSkeleton from '../components/ui/RidesSkeleton';
import ErrorState from '../components/ui/ErrorState';
import { useApi } from '../hooks/useApi';
import EarningsPanel, { type EarningsPeriodKey, type EarningsPeriodOption } from '../components/ui/EarningsPanel';
import { RidesScope, RidesSummary, UpcomingBooking } from '../types/enums';
import { groupByDay, matchesQuery, rideMoment, type RideSection } from '../constants/booking';
import { useTheme } from '../theme/ThemeContext';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Search = cssInterop(MagnifyingGlassIcon, asThemed);
const Clear = cssInterop(XIcon, asThemed);

const MUTED = 'text-ink-muted';
const INK_TEXT = 'text-ink';

// The floating AppBar sits at bottom-8 and runs ~64px tall. The list scrolls under
// it by design, so the last row needs its own clearance or it can never be read.
const BAR_CLEARANCE = 132;
const HISTORY_PAGE_SIZE = 100;
const IST_OFFSET_MS = 330 * 60 * 1000;

// The screen title carries the wordmark's treatment: same cut, same text-xl, same
// tracking, so "Rides" and "RCS Travels" read as one voice rather than two headings
// that happen to sit on different screens.
//
// The number is duplicated from OnlineToggle rather than shared because tracking here
// is in POINTS, not em — see tailwind.config.js — so it is only correct at the size it
// was tuned for, and a shared token with no size attached to it would invite being
// applied at the wrong one. If a third title appears, give it a real named style.
const TITLE_TRACKING = { letterSpacing: -0.72 };

type ApiError = { error: string; status: number; code?: string };
type GetRidesResponse =
    | { bookings: UpcomingBooking[]; hasMore: boolean; summary: RidesSummary | null }
    | ApiError;

// Reanimated pre-wraps ScrollView and FlatList but not SectionList, and only a
// wrapped scroller can take a worklet handler on onScroll — which is what tells
// the AppBar to get out of the way. Wrapping drops SectionList's generics on the
// floor, so the cast puts this list's own row and section types back: without it
// every renderItem below is handed an unknown.
type RideListProps = Omit<SectionListProps<UpcomingBooking, RideSection>, 'onScroll'> & {
    onScroll?: ReturnType<typeof useHideAppBarOnScroll>;
};

const AnimatedSectionList = Animated.createAnimatedComponent(
    SectionList,
) as unknown as ComponentType<RideListProps>;

const TABS: { key: RidesScope; label: string }[] = [
    { key: 'upcoming', get "label"() { return dc("Upcoming"); } },
    { key: 'history', get "label"() { return dc("History"); } },
];

const HISTORY_PERIODS: EarningsPeriodOption[] = [
    { key: 'today', get "label"() { return dc("Today"); } },
    { key: 'week', get "label"() { return dc("This week"); } },
    { key: 'month', get "label"() { return dc("This month"); } },
    { key: 'threeMonths', get "label"() { return dc("Last 3 months"); } },
];

const HISTORY_PERIOD_KEYS = new Set<EarningsPeriodKey>(HISTORY_PERIODS.map((period) => period.key));

const scopeFromSearch = (search: string): RidesScope =>
    new URLSearchParams(search).get('tab') === 'history' ? 'history' : 'upcoming';

const historyPeriodFromSearch = (search: string): EarningsPeriodKey => {
    const value = new URLSearchParams(search).get('period') as EarningsPeriodKey | null;
    return value && HISTORY_PERIOD_KEYS.has(value) ? value : 'week';
};

const pathForScope = (scope: RidesScope, period: EarningsPeriodKey = 'week') => {
    if (scope !== 'history') return '/rides';
    return period === 'week' ? '/rides?tab=history' : `/rides?tab=history&period=${period}`;
};

// Every date boundary is calculated on India's calendar rather than the device's
// current timezone. Captains cross state lines; the meaning of "Today" should not
// shift because a handset is temporarily reporting another zone.
const historyPeriodStart = (period: EarningsPeriodKey, now = new Date()) => {
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    const year = ist.getUTCFullYear();
    const month = ist.getUTCMonth();
    const day = ist.getUTCDate();

    if (period === 'today') {
        return new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
    }

    if (period === 'week') {
        const weekday = (ist.getUTCDay() + 6) % 7;
        return new Date(Date.UTC(year, month, day - weekday) - IST_OFFSET_MS);
    }

    if (period === 'month') {
        return new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
    }

    const shifted = new Date(ist);
    shifted.setUTCDate(1);
    shifted.setUTCMonth(shifted.getUTCMonth() - 3);
    const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
    shifted.setUTCDate(Math.min(day, lastDay));
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - IST_OFFSET_MS);
};

const Rides = () => {
    useCopyLanguage();
    const { colors } = useTheme();
    const api = useApi();
    const location = useLocation();
    const navigate = useNavigate();
    const onScroll = useHideAppBarOnScroll();

    // The tab belongs to this navigation entry, not only to this component. Routes
    // unmounts the board while a detail is open, so local state alone always came
    // back as Upcoming. Keeping History in the entry URL lets every kind of Back
    // (header, Android and edge swipe) restore the board that opened the ride.
    const [scope, setScope] = useState<RidesScope>(() => scopeFromSearch(location.search));
    const [historyPeriod, setHistoryPeriod] = useState<EarningsPeriodKey>(() => historyPeriodFromSearch(location.search));
    // Kept per tab, not per screen. Both boards are one request each and neither
    // changes while the captain is looking at the other, so re-fetching on every
    // switch bought nothing and cost a round trip to ap-south-1 — with an empty list
    // held up on screen for the whole of it. Cached, the tab flips on the frame it is
    // tapped and the refresh lands behind it. null means "never loaded", which is the
    // only state that earns a spinner; [] means "loaded, and there is nothing".
    const [ridesByScope, setRidesByScope] = useState<Record<RidesScope, UpcomingBooking[] | null>>({
        upcoming: null,
        history: null,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cached = ridesByScope[scope];

    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    // Opening search is a prompt to start a new lookup, not another way to browse
    // the current board. Keep the results area clear until the captain types.
    const isSearchIdle = searching && query.trim().length === 0;

    const latestRequest = useRef(0);

    // The api object is read through a ref rather than closed over. useApi memoises on
    // Clerk's getToken, which is not promised to keep its identity across renders — and
    // when it does not, `refresh` is a new function every render, the effect below
    // re-runs every render, and its cleanup marks the in-flight request stale before it
    // can land. Every response is then discarded by the guard, `setLoading(false)` is
    // skipped with it, and the spinner runs forever against a list that never fills.
    // Home survives the same pattern only because it has no loading state to strand.
    const apiRef = useRef(api);
    apiRef.current = api;

    const refresh = useCallback(async (next: RidesScope) => {
        const requestId = ++latestRequest.current;
        setLoading(true);
        setError(null);
        try {
            const data = await apiRef.current.getRides(
                next === 'history'
                    ? { scope: next, page: 1, limit: HISTORY_PAGE_SIZE }
                    : { scope: next },
            ) as GetRidesResponse;
            if (requestId !== latestRequest.current) return;

            // A failed refresh leaves the rows already on screen alone. Blanking a
            // list the captain is reading because the network dropped for one poll
            // takes away the only copy of it he has; the banner says so instead.
            if ('error' in data) {
                setError(data.error);
            } else {
                let bookings = data.bookings;

                // History is deliberately limited by the backend to the recent
                // three-month window, but the endpoint is paged within that window.
                // Pull every page here so narrowing that set to Today/Week/Month never
                // silently means "among the first 30 rides".
                if (next === 'history') {
                    let page = 1;
                    let hasMore = data.hasMore;

                    while (hasMore) {
                        page += 1;
                        const pageData = await apiRef.current.getRides({
                            scope: next,
                            page,
                            limit: HISTORY_PAGE_SIZE,
                        }) as GetRidesResponse;
                        if (requestId !== latestRequest.current) return;
                        if ('error' in pageData) throw new Error(pageData.error);

                        bookings = [...bookings, ...pageData.bookings];
                        hasMore = pageData.hasMore;
                    }

                    // A new completion landing between page requests can shift the
                    // boundary by one row. Keep one copy of each ride; the next poll
                    // will naturally reconcile the ordering.
                    bookings = [...new Map(bookings.map((booking) => [booking.id, booking])).values()];
                }

                setRidesByScope((current) => ({ ...current, [next]: bookings }));
            }
        } catch (e: unknown) {
            if (requestId !== latestRequest.current) return;
            setError(e instanceof Error ? e.message : dc("Something went wrong"));
        } finally {
            if (requestId === latestRequest.current) setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(scope); }, [refresh, scope]);

    // Unmount only — an empty dep array, so leaving the screen abandons whatever is in
    // flight without any dep change being able to abandon it mid-load.
    useEffect(() => () => { latestRequest.current++; }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') refresh(scope);
        });

        return () => subscription.remove();
    }, [refresh, scope]);

    // Tapping Rides on the bar still lands on Upcoming because that navigation removes
    // `tab=history`. Returning through router history keeps it, so a detail's Back no
    // longer looks identical to a fresh tab-bar tap. The route key also covers replace
    // navigation to the same path, where pathname alone would not change.
    useEffect(() => {
        setScope(scopeFromSearch(location.search));
        setHistoryPeriod(historyPeriodFromSearch(location.search));
        setSearching(false);
        setQuery('');
    }, [location.key, location.search]);

    // Recompute the boundary on every render, then memoise downstream work by its
    // timestamp. Today/week/month therefore stay stable during ordinary renders but
    // naturally roll over after a refresh or foreground transition crosses a boundary.
    const historySince = historyPeriodStart(historyPeriod);
    const historySinceMs = historySince.getTime();

    const periodRides = useMemo(() => {
        const all = cached ?? [];
        if (scope !== 'history') return all;

        return all.filter((ride) => rideMoment(ride).getTime() >= historySinceMs);
    }, [cached, historySinceMs, scope]);

    const historySummary = useMemo<RidesSummary | null>(() => {
        if (scope !== 'history' || cached === null) return null;

        const completed = periodRides.filter((ride) => ride.status === 'completed');
        return {
            earned: completed.reduce((total, ride) => total + ride.fare - ride.commissionAmt, 0),
            rides: completed.length,
            since: new Date(historySinceMs).toISOString(),
        };
    }, [cached, historySinceMs, periodRides, scope]);

    // History runs backwards from now, upcoming forwards. Both read as "nearest to
    // today first", which is the same instinct pointed in two directions.
    // The empty-array fallback lives inside the memo on purpose: written outside, it is
    // a fresh array on every render that has no cache, which changes the dependency
    // every time and re-groups the whole list for nothing.
    const sections = useMemo(() => {
        const matched = isSearchIdle ? [] : query ? periodRides.filter((ride) => matchesQuery(ride, query)) : periodRides;
        return groupByDay(matched, new Date(), scope === 'history' ? 'desc' : 'asc');
    }, [isSearchIdle, periodRides, query, scope]);

    // This board has never come back. Not "is empty" — `[]` is empty; null is unknown.
    // Everything below keys off that distinction, because the two states share no copy:
    // one says there is nothing, the other cannot say anything yet.
    const firstLoad = cached === null;

    // ...and it came back an error. `loading` is deliberately NOT part of this, nor of
    // the skeleton branch below, and that is the whole fix for a flash of "No finished
    // rides yet" on the first switch to a tab.
    //
    // switchTo sets `scope` synchronously; the fetch that sets `loading` lives in an
    // effect, and effects run AFTER paint. So between the tap and the request there is a
    // committed frame where cached is null, loading is still false and error is still
    // null — and a skeleton gated on `loading && firstLoad` loses it, dropping the render
    // through to the list, which has [] sections and draws its empty state. One painted
    // frame of "No finished rides yet" on a board that in fact has eight rides.
    //
    // Gating on `firstLoad` alone closes the window: unknown renders the skeleton whether
    // or not the request has started yet.
    const failedFirstLoad = firstLoad && error !== null;

    const switchTo = (next: RidesScope) => {
        if (next === scope) return;
        setScope(next);
        // Replace rather than push: switching a tab should not require another Back
        // press later. The replaced entry is nevertheless what a ride detail returns
        // to, complete with the selected tab.
        navigate(pathForScope(next, historyPeriod), { replace: true });
        // The banner belongs to the board that failed, not to the screen.
        setError(null);
    };

    const changeHistoryPeriod = (next: EarningsPeriodKey) => {
        if (next === historyPeriod) return;
        setHistoryPeriod(next);
        navigate(pathForScope('history', next), { replace: true });
    };

    return (
        <View className="flex-1 w-[92%] gap-3">
            <View className="flex-row items-center justify-between gap-3">
                {searching ? (
                    <View
                        className="flex-1 flex-row items-center gap-2 rounded-full px-4 h-11"
                        style={{ backgroundColor: colors.surfaceMuted }}
                    >
                        <Search size={18} weight="bold" className={MUTED} />
                        <TextInput
                            autoFocus
                            value={query}
                            onChangeText={setQuery}
                            placeholder={dc("Place, rider or ride number")}
                            placeholderTextColor={colors.inkMuted}
                            returnKeyType="search"
                            className={`flex-1 font-sans ${INK_TEXT}`}
                            style={{ paddingVertical: 0 }}
                        />
                        <Pressable
                            role="button"
                            aria-label={dc("Close search")}
                            onPress={() => { setSearching(false); setQuery(''); }}
                            hitSlop={8}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <Clear size={18} weight="bold" className={MUTED} />
                        </Pressable>
                    </View>
                ) : (
                    <>
                        {/* Spacer, so the title stays optically centred against the
                            search button rather than being pushed off by it. */}
                        <View className="w-11 h-11" />
                        <AppText className={`text-xl font-semibold ${INK_TEXT}`} style={TITLE_TRACKING}>{dc("Rides")}</AppText>
                        <Pressable
                            role="button"
                            aria-label={dc("Search rides")}
                            onPress={() => setSearching(true)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                            <View
                                className="w-11 h-11 rounded-full items-center justify-center"
                                style={{ backgroundColor: colors.surfaceMuted }}
                            >
                                <Search size={20} weight="bold" className={INK_TEXT} />
                            </View>
                        </Pressable>
                    </>
                )}
            </View>

            <View className="flex-row rounded-full p-1" style={{ backgroundColor: colors.surfaceMuted }}>
                {TABS.map((tab) => {
                    const active = tab.key === scope;
                    return (
                        // One element, styled entirely by className, with no style prop
                        // anywhere near it. Layout, radius and fill set two different
                        // ways on two nested elements is what left this a square slab:
                        // a style function drops whole, and a style object beside a
                        // className competes with it over who owns the box. The Post FAB
                        // in AppBar is a circle drawn exactly this way — className only,
                        // on the Pressable itself — so this is the shape that is known
                        // to survive the interop.
                        <Pressable
                            key={tab.key}
                            role="tab"
                            aria-selected={active}
                            onPress={() => switchTo(tab.key)}
                            className={`flex-1 items-center justify-center rounded-full py-2.5 px-3 ${active ? 'bg-strong' : 'bg-transparent'}`}
                        >
                            <AppText
                                className={`text-base font-semibold ${active ? 'text-white' : MUTED}`}
                            >
                                {tab.label}
                            </AppText>
                        </Pressable>
                    );
                })}
            </View>

            {error && !failedFirstLoad && !isSearchIdle && (
                <View className="w-full flex-row items-center justify-between gap-4">
                    <AppText numberOfLines={2} className="flex-1 text-sm text-red-600">{error}</AppText>
                    <Pressable
                        role="button"
                        onPress={() => refresh(scope)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                        <AppText className="text-sm font-semibold text-primary">{dc("Try again")}</AppText>
                    </Pressable>
                </View>
            )}

            {/* PINNED. A sibling of the list rather than its ListHeaderComponent, so
                the week's total holds its place while the rows move under it.

                History only, and still held back until that first load lands — a
                panel that appears reading zero and then corrects itself is worse than
                one that arrives late. Outside the list rather than sticky inside it
                for the same reason Account pins its identity block: a sticky header
                would let rows slide behind a panel drawn on the page's own white.

                The cost is real and falls on the tab that can least afford it. This
                board is the long one — a captain scrolls back through a fortnight of
                rides here — and the panel now takes its height off every screen of
                that scroll rather than leaving with the first swipe.

                Gone while the search field is open. A week's total is an answer to
                "how did this week go", and a captain who is searching has asked a
                different question — the total then heads a filtered list it does not
                describe, on the one board where the results need every row of height
                they can get. It comes back when the field closes; nothing is recomputed. */}
            {scope === 'history' && historySummary && !searching && (
                <EarningsPanel
                    summary={historySummary}
                    period={historyPeriod}
                    periodOptions={HISTORY_PERIODS}
                    onPeriodChange={changeHistoryPeriod}
                />
            )}

            {isSearchIdle ? (
                <View className="flex-1" />
            ) : firstLoad && !failedFirstLoad ? (
                // The board's own shape rather than a spinner in the middle of nothing.
                // History reserves the panel's height too, so the rows do not shunt down
                // when the week's total lands a frame after them.
                //
                // No `loading` in this condition — see the note on failedFirstLoad. An
                // unknown board draws the skeleton from the frame the tab is tapped,
                // which is a frame before the request it is waiting on even exists.
                <RidesSkeleton withPanel={scope === 'history' && !searching} />
            ) : failedFirstLoad ? (
                <ErrorState
                    title={dc("Can't load your rides")}
                    message={error}
                    actionLabel={dc("Try again")}
                    onAction={() => refresh(scope)}
                />
            ) : (
                <AnimatedSectionList
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    stickySectionHeadersEnabled={false}
                    showsVerticalScrollIndicator={false}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    // The week's total used to head this list. It is pinned above the
                    // scroller now — see the block before the spinner branch.
                    //
                    // flex:1 is load-bearing. Without it the list takes its content's
                    // height inside a flex-1 column, so a full board runs off the
                    // bottom of the screen instead of scrolling inside it.
                    style={{ flex: 1, width: '100%' }}
                    contentContainerStyle={{ gap: 8, paddingBottom: BAR_CLEARANCE, flexGrow: 1 }}
                    renderSectionHeader={({ section }) => (
                        <AppText className={`text-xs font-semibold uppercase tracking-wide px-1 pt-2 ${MUTED}`}>
                            {section.title}
                        </AppText>
                    )}
                    renderItem={({ item }) => (
                        <RideRow
                            booking={item}
                            historic={scope === 'history'}
                            onPress={() => navigate(`/rides/${item.id}`)}
                        />
                    )}
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center gap-1 pb-24 px-6">
                            <AppText className={`text-base font-semibold text-center ${INK_TEXT}`}>
                                {query
                                    ? dc("No rides match that")
                                    : scope === 'history' && (cached?.length ?? 0) > 0
                                        ? dc("No rides in this period")
                                    : scope === 'upcoming'
                                        ? dc("No rides booked yet")
                                        : dc("No finished rides yet")}
                            </AppText>
                            <AppText className={`text-sm text-center ${MUTED}`}>
                                {query
                                    ? dc("Try a place, a rider name, or a ride ID.")
                                    : scope === 'history' && (cached?.length ?? 0) > 0
                                        ? dc("Try a wider date range.")
                                    : scope === 'upcoming'
                                        ? dc("Go online and rides you accept will queue up here.")
                                        : dc("Rides you complete or cancel are kept here.")}
                            </AppText>
                        </View>
                    }
                />
            )}

            {/* Kept out of the list so a refresh never steals the captain's scroll
                position — the rows already on screen stay exactly where they are.

                No !isEmpty guard. It used to have one, and it hid this spinner in
                exactly the two states that most look like a dead app: refreshing a board
                with nothing on it, and refreshing while a search matches nothing. Both
                are a blank screen under a tap that appeared to do nothing. `isEmpty` is
                computed from the FILTERED sections, so the search case was not even the
                one the guard was written for. */}
            {loading && !firstLoad && !isSearchIdle && (
                <View className="absolute right-1 top-1">
                    <ActivityIndicator size="small" color={colors.ink} />
                </View>
            )}
        </View>
    );
};

export default Rides;

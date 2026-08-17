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
import EarningsPanel from '../components/ui/EarningsPanel';
import { RidesScope, RidesSummary, UpcomingBooking } from '../types/enums';
import { groupByDay, matchesQuery, type RideSection } from '../constants/booking';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Search = cssInterop(MagnifyingGlassIcon, asThemed);
const Clear = cssInterop(XIcon, asThemed);

const CARD = '#f3f3f3';                          // --foreground-muted
const INK = '#121220';                           // --background-primary
const MUTED = 'text-gray-600';
const INK_TEXT = 'text-[var(--background-primary)]';

// The floating AppBar sits at bottom-8 and runs ~64px tall. The list scrolls under
// it by design, so the last row needs its own clearance or it can never be read.
const BAR_CLEARANCE = 132;

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
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'history', label: 'History' },
];

const Rides = () => {
    const api = useApi();
    const location = useLocation();
    const navigate = useNavigate();
    const onScroll = useHideAppBarOnScroll();

    const [scope, setScope] = useState<RidesScope>('upcoming');
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
    // Not kept per scope like the rows are: only history has one, and it is refreshed
    // by the same request that fills the board it heads.
    const [summary, setSummary] = useState<RidesSummary | null>(null);
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
            const data = await apiRef.current.getRides({ scope: next }) as GetRidesResponse;
            if (requestId !== latestRequest.current) return;

            // A failed refresh leaves the rows already on screen alone. Blanking a
            // list the captain is reading because the network dropped for one poll
            // takes away the only copy of it he has; the banner says so instead.
            if ('error' in data) {
                setError(data.error);
            } else {
                setRidesByScope((current) => ({ ...current, [next]: data.bookings }));
                // Left standing when the upcoming board answers with null, so switching
                // tabs and back does not blank a total that is still true.
                if (data.summary) setSummary(data.summary);
            }
        } catch (e: unknown) {
            if (requestId !== latestRequest.current) return;
            setError(e instanceof Error ? e.message : 'Something went wrong');
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

    // Tapping Rides on the bar always lands on Upcoming — the work ahead is what the
    // tab is for, and a captain who left the app on History last week should not have
    // to find his way back. The AppBar navigates with replace to a path that may
    // already be current, so the route key is what marks the tap; pathname would not
    // change and the effect would never run.
    useEffect(() => {
        setScope('upcoming');
        setSearching(false);
        setQuery('');
    }, [location.key]);

    // History runs backwards from now, upcoming forwards. Both read as "nearest to
    // today first", which is the same instinct pointed in two directions.
    // The empty-array fallback lives inside the memo on purpose: written outside, it is
    // a fresh array on every render that has no cache, which changes the dependency
    // every time and re-groups the whole list for nothing.
    const sections = useMemo(() => {
        const all = cached ?? [];
        const matched = isSearchIdle ? [] : query ? all.filter((ride) => matchesQuery(ride, query)) : all;
        return groupByDay(matched, new Date(), scope === 'history' ? 'desc' : 'asc');
    }, [cached, isSearchIdle, query, scope]);

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
        // The banner belongs to the board that failed, not to the screen.
        setError(null);
    };

    return (
        <View className="flex-1 w-[92%] gap-3">
            <View className="flex-row items-center justify-between gap-3">
                {searching ? (
                    <View
                        className="flex-1 flex-row items-center gap-2 rounded-full px-4 h-11"
                        style={{ backgroundColor: CARD }}
                    >
                        <Search size={18} weight="bold" className={MUTED} />
                        <TextInput
                            autoFocus
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Place, rider or ride number"
                            placeholderTextColor="#6B7280"
                            returnKeyType="search"
                            className={`flex-1 font-sans ${INK_TEXT}`}
                            style={{ paddingVertical: 0 }}
                        />
                        <Pressable
                            role="button"
                            aria-label="Close search"
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
                        <AppText className={`text-xl font-semibold ${INK_TEXT}`} style={TITLE_TRACKING}>
                            Rides
                        </AppText>
                        <Pressable
                            role="button"
                            aria-label="Search rides"
                            onPress={() => setSearching(true)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                            <View
                                className="w-11 h-11 rounded-full items-center justify-center"
                                style={{ backgroundColor: CARD }}
                            >
                                <Search size={20} weight="bold" className={INK_TEXT} />
                            </View>
                        </Pressable>
                    </>
                )}
            </View>

            <View className="flex-row rounded-full p-1" style={{ backgroundColor: CARD }}>
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
                            className={`flex-1 items-center justify-center rounded-full py-2.5 px-3 ${active ? 'bg-[#121220]' : 'bg-transparent'}`}
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
                        <AppText className="text-sm font-semibold text-primary">Try again</AppText>
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
            {scope === 'history' && summary && !searching && <EarningsPanel summary={summary} />}

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
                <RidesSkeleton withPanel={scope === 'history' && !summary && !searching} />
            ) : failedFirstLoad ? (
                <ErrorState
                    title="Can't load your rides"
                    message={error}
                    actionLabel="Try again"
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
                                    ? 'No rides match that'
                                    : scope === 'upcoming'
                                        ? 'No rides booked yet'
                                        : 'No finished rides yet'}
                            </AppText>
                            <AppText className={`text-sm text-center ${MUTED}`}>
                                {query
                                    ? 'Try a place, a rider name, or a ride ID.'
                                    : scope === 'upcoming'
                                        ? 'Go online and rides you accept will queue up here.'
                                        : 'Rides you complete or cancel are kept here.'}
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
                    <ActivityIndicator size="small" color={INK} />
                </View>
            )}
        </View>
    );
};

export default Rides;

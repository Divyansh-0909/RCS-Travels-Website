import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Easing, useAnimatedScrollHandler, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useLocation } from "react-router-native";
import { useDriver } from "../hooks/useDriver";

// The bar lives in the shell and the scrolling lives in the routes, so the two
// can only meet through context. A shared value rather than state on purpose:
// the decision is taken on the UI thread inside a scroll handler, and routing a
// scroll event through React would drop frames on every drag.
//
// 0 = parked at the bottom, 1 = pushed off the bottom edge.
type AppBarVisibility = { hidden: SharedValue<number> };

const AppBarVisibilityContext = createContext<AppBarVisibility | null>(null);

// A drag has to run this far in one direction before the bar reacts. Under it
// the bar chatters on the small counter-movements a thumb makes mid-scroll.
const DIRECTION_THRESHOLD = 8;

// The top of a list always shows the bar, whatever direction got you there: a
// captain back at the newest ride is done reading and looking for somewhere to go.
const TOP_ZONE = 24;

// The one timing for everything parked at the bottom edge. Exported rather than
// written out twice because the bar and the scrim behind it have to leave together:
// two curves that differ by 40ms read as the fade lagging the bar it belongs to,
// which is the kind of thing you see without being able to name.
export const HIDE = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

// "/rides" is a board and keeps the bar. "/rides/<id>" is a drill-down: it has a back
// arrow, it owns the whole screen, and a tab bar under it would offer to leave the
// section from a screen whose own affordance is to go up one level.
//
// Every "/account/*" route is the same shape: reached from the Account menu, wearing
// a back arrow, and owning the full screen until the captain returns. Some end in a
// document picker or form, while others are reading pages; in both cases a floating
// tab bar would compete with the route's own navigation and cover its final action.
//
// Both the bar and the scrim read this, and that is the point of it living here rather
// than in either file. The scrim is a WHITE fade sized to the bar it backs — on a
// screen with no bar it is a white gradient over whatever that page's background is,
// and at zIndex 40 over routes that set none, it also covers anything the page has
// pinned to its own bottom edge.
export const isDrillDown = (pathname: string) =>
    /^\/rides\/.+/.test(pathname)
    || /^\/available\/.+/.test(pathname)
    || pathname.startsWith('/account/')
    || pathname === '/notifications'

/**
 * Whether the shell should get out of the way entirely.
 *
 * TWO REASONS, ONE ANSWER, and they are read by three components — the bar, the
 * scrim behind it, and the header on Home. A rule that decided this in each of
 * them would drift, and the failure is visible: a scrim with no bar to back is a
 * white ramp across the bottom of the screen, over a map, hiding whatever the
 * page pinned under it.
 *
 * The drill-down half is a route: a screen with a back arrow owns the whole
 * screen. The active-ride half is a STATE, and it is the stronger of the two.
 * While a rider is in the car the captain is not browsing the app, he is
 * driving — everything the bar offers him is somewhere he should not be going,
 * and the panel he actually needs wants the bottom of the screen the bar is
 * floating in.
 *
 * `assigned` is not enough to trigger this. He can hold a scheduled ride for
 * days; only en_route, reached and started mean he is out on the road, which is
 * why the server answers with the ride rather than with a count.
 *
 * ON THE RIDE SCREEN ONLY, AND THAT PART IS NOT A REFINEMENT — it is what keeps
 * the app escapable. Hiding the bar everywhere for the length of a ride would
 * strand him: the bell is the one control left on the ride screen, it opens
 * /notifications, and a Notifications page with no bar and no back arrow is a
 * screen with no way out of it. The ride owns "/"; every other route keeps the
 * bar that gets him home.
 */
/**
 * Where anything that arrives UNBIDDEN sits: the top of the screen.
 *
 * Offers, the call-the-rider prompt, anything the app raises rather than the
 * captain opens. They go to the top because the bottom of this app is where the
 * things he reaches for live — the tab bar, the ride sheet, the slide-to-confirm
 * — and dropping an interruption on top of those puts it under his thumb at the
 * moment he is using them. A notice he did not ask for should not be able to
 * catch a tap meant for a control he did.
 *
 * OVER THE HEADER, NOT UNDER IT. These used to start below OnlineToggle so as
 * not to cover the online switch — which was the wrong instinct. A ride landing
 * is more urgent than the switch that says he is available for one, and the
 * captain has seconds to answer it; making him read past the wordmark to find
 * the card costs him some of them. The notices carry a higher z than the header
 * (OfferPanel 60, the accepted prompt 90, against the header's 50), so they
 * simply sit on top of it for as long as they are up.
 *
 * A single number now, and the hook stays because the value is still shared by
 * two components and because where a notice belongs is a decision about the app
 * rather than about either of them.
 */
const NOTICE_TOP = 44;

export const useNoticeTop = () => NOTICE_TOP;

export const useShellHidden = () => {
    const { pathname } = useLocation();
    const { profile } = useDriver();

    // "/" is where HomeGate puts the ride screen, so this is "he is driving AND
    // he is looking at the ride".
    const onRideScreen = Boolean(profile?.activeRide) && pathname === '/';

    return { hidden: isDrillDown(pathname) || onRideScreen, onActiveRide: onRideScreen };
};

export const AppBarVisibilityProvider = ({ children }: { children: ReactNode }) => {
    const hidden = useSharedValue(0);
    const { pathname } = useLocation();

    // Every route opens with the bar down. Without this, leaving a screen
    // mid-scroll hands the next one a hidden bar and no scroll to bring it back.
    useEffect(() => {
        hidden.value = 0;
    }, [pathname, hidden]);

    const value = useMemo(() => ({ hidden }), [hidden]);

    return (
        <AppBarVisibilityContext.Provider value={value}>
            {children}
        </AppBarVisibilityContext.Provider>
    );
};

export const useAppBarVisibility = () => {
    const context = useContext(AppBarVisibilityContext);
    if (!context) throw new Error("useAppBarVisibility must be used inside <AppBarVisibilityProvider>");
    return context;
};

// Hand the result to onScroll on any Animated scroller inside the shell, with
// scrollEventThrottle={16}. Plain react-native scrollers will not take it.
export const useHideAppBarOnScroll = () => {
    const { hidden } = useAppBarVisibility();

    // The anchor the next delta is measured from. It only moves when the bar
    // moves, so a slow drag accumulates towards the threshold instead of being
    // reset to nothing by every frame that fell short of it.
    const lastY = useSharedValue(0);

    return useAnimatedScrollHandler({
        onScroll: (event) => {
            const y = event.contentOffset.y;
            const delta = y - lastY.value;

            if (y <= TOP_ZONE) {
                hidden.value = 0;
                lastY.value = y;
                return;
            }

            if (delta > DIRECTION_THRESHOLD) hidden.value = 1;
            else if (delta < -DIRECTION_THRESHOLD) hidden.value = 0;
            else return;

            lastY.value = y;
        },
    });
};

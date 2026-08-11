import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Easing, useAnimatedScrollHandler, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useLocation } from "react-router-native";

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
// Both the bar and the scrim read this, and that is the point of it living here rather
// than in either file. The scrim is a WHITE fade sized to the bar it backs — on a
// screen with no bar it is a white gradient over whatever that page's background is,
// and at zIndex 40 over routes that set none, it also covers anything the page has
// pinned to its own bottom edge.
export const isDrillDown = (pathname: string) => /^\/rides\/.+/.test(pathname);

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

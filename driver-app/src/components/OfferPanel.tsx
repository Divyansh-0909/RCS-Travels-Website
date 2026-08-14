import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, PanResponder, View } from 'react-native';
import Animated, {
    cancelAnimation,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import AppText from './AppText';
import { useNoticeTop } from './AppBarVisibility';
import { OfferCard } from './ui/offerCard';
import { useOffers } from '../hooks/useOffers';

/**
 * The newest offer, floated over whatever screen he is on.
 *
 * Over EVERY screen on purpose: an offer that only appeared on Notifications
 * would be missed by a captain doing anything else in the app, which is most of
 * the time he has it open. The Notifications page is the record; this is the
 * interruption.
 */

const SCREEN_W = Dimensions.get('window').width;

/** Past this, a release is a dismissal rather than a nudge. */
const DISMISS_AT = SCREEN_W * 0.28;

/**
 * How long the card holds the screen.
 *
 * IT DISMISSES THE PANEL, IT DOES NOT EXPIRE THE OFFER, and the difference
 * matters more than the number. A scheduled offer has no server-side deadline:
 * it is a row that waits for him, deliberately shown even while he is offline,
 * and a ride three days out must not be given away because he did not look at
 * his phone for half a minute. Auto-REJECTING would be worse still — eligibleGroup
 * counts a rejection as resolved, so it would escalate the booking to partner
 * drivers within thirty seconds of every sweep.
 *
 * So this is the same action as a swipe: the card goes, the ride stays on
 * Notifications. When ride-now dispatch becomes event-driven, that path DOES get
 * a real deadline, and this timer becomes the visible half of it.
 */
const PANEL_SECONDS = 30;

const PANEL_Z = 60;

const OfferPanel = () => {
    const { panelOffer, canAccept, here, accept, reject, dismiss } = useOffers();
    // Pinned to the top with everything else the app raises on its own. See
    // useNoticeTop for why the bottom is the wrong end of this screen for it.
    const top = useNoticeTop();
    const [error, setError] = useState<string | null>(null);

    const tx = useSharedValue(0);
    const life = useSharedValue(1);

    const offerId = panelOffer?.offerId ?? null;

    // PanResponder is built once and would otherwise close over the first
    // render's offer id forever, dismissing a card that had already been
    // replaced. Refs keep the gesture pointed at whatever is on screen now.
    const idRef = useRef(offerId);
    idRef.current = offerId;
    const dismissRef = useRef(dismiss);
    dismissRef.current = dismiss;

    const hide = useCallback(() => {
        const id = idRef.current;
        if (id) dismissRef.current(id);
    }, []);

    // Restart for each new offer: reset the position a previous swipe left
    // behind, and give this card its own full thirty seconds.
    useEffect(() => {
        if (!offerId) return;

        setError(null);
        tx.value = 0;
        life.value = 1;
        life.value = withTiming(0, { duration: PANEL_SECONDS * 1000 });

        const timer = setTimeout(hide, PANEL_SECONDS * 1000);
        return () => {
            clearTimeout(timer);
            cancelAnimation(life);
        };
    }, [offerId, hide, tx, life]);

    const pan = useRef(
        PanResponder.create({
            // Horizontal intent only. The threshold and the dominance check keep
            // this from stealing a vertical scroll that merely started crooked.
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
            onPanResponderMove: (_, g) => { tx.value = g.dx; },
            onPanResponderRelease: (_, g) => {
                // A flick counts as well as a drag: velocity is what separates
                // "thrown away" from "moved a little and let go".
                const leaving = Math.abs(g.dx) > DISMISS_AT || Math.abs(g.vx) > 0.6;

                if (leaving) {
                    tx.value = withTiming(
                        Math.sign(g.dx || 1) * SCREEN_W,
                        { duration: 160 },
                        (finished) => { if (finished) runOnJS(hide)(); },
                    );
                } else {
                    tx.value = withSpring(0, { damping: 18, stiffness: 180 });
                }
            },
        }),
    ).current;

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: tx.value }],
        // Fades as it goes, so the swipe reads as removal rather than as sliding
        // the card somewhere it might come back from.
        opacity: 1 - Math.min(Math.abs(tx.value) / (SCREEN_W * 0.6), 1) * 0.85,
    }));

    const barStyle = useAnimatedStyle(() => ({ width: `${life.value * 100}%` }));

    if (!panelOffer) return null;

    const answer = async (action: (id: string) => Promise<{ error?: string } | null>) => {
        const failure = await action(panelOffer.offerId);
        // Left on screen when it fails, and only then: the message is about THIS
        // card, and hiding it would take the explanation with it.
        setError(failure?.error ?? null);
    };

    return (
        <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 0, right: 0, top, zIndex: PANEL_Z, alignItems: 'center' }}
        >
            <Animated.View style={[{ width: '92%' }, cardStyle]} {...pan.panHandlers}>
                {/* The clock, as a line that empties rather than a number counting
                    down. He is driving; a shrinking bar is read in a glance and a
                    digit has to be actually read. */}
                <View className="h-1 w-full rounded-full overflow-hidden bg-[var(--background-muted)] mb-1.5">
                    <Animated.View className="h-full rounded-full bg-primary" style={barStyle} />
                </View>

                <OfferCard
                    offer={panelOffer}
                    here={here}
                    canAccept={canAccept}
                    onAccept={() => answer(accept)}
                    onReject={() => answer(reject)}
                />

                {error ? (
                    <View className="mt-2 self-center rounded-full bg-[var(--background-primary)] px-4 py-2">
                        <AppText className="text-sm font-medium text-red-400">{error}</AppText>
                    </View>
                ) : (
                    <AppText className="text-xs text-center mt-2 text-[var(--background-primary)] opacity-60">
                        Swipe away to hide — it stays in Notifications
                    </AppText>
                )}
            </Animated.View>
        </View>
    );
};

export default OfferPanel;

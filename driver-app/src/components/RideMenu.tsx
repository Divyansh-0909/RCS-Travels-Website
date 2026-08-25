import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Dimensions, Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { ListIcon, XIcon } from 'phosphor-react-native';
import Animated, { FadeIn, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useLocation, useNavigate } from 'react-router-native';
import AppText from './AppText';
import { tabsFor } from './ui/tabs';
import { useDriver } from '../hooks/useDriver';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Burger = cssInterop(ListIcon, asThemed);
const Cross = cssInterop(XIcon, asThemed);

/**
 * The tab bar, folded into a drawer for the length of a ride.
 *
 * WHY IT EXISTS. The bar and the online switch both come off the screen while a
 * captain is driving — the map wants the whole screen and the switch is a
 * control the server would refuse anyway. But taking the bar away takes his only
 * route to Rides and Account with it, and a captain mid-shift still has reason
 * to look at either. So the destinations move rather than disappear: one button
 * where the switch used to be, and the same list behind it.
 *
 * POST IS NOT IN IT, and that is the one deliberate omission. Post offers a ride
 * to the marketplace — it is a thing he does when he is free, and offering it to
 * a man with a rider in the car is offering him work he cannot take.
 */

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

type RideMenuValue = { open: boolean; setOpen: (open: boolean) => void };

const RideMenuContext = createContext<RideMenuValue | null>(null);

export const RideMenuProvider = ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    const value = useMemo(() => ({ open, setOpen }), [open]);
    return <RideMenuContext.Provider value={value}>{children}</RideMenuContext.Provider>;
};

const useRideMenu = () => {
    const value = useContext(RideMenuContext);
    if (!value) throw new Error('RideMenu components must be used inside a RideMenuProvider');
    return value;
};

/**
 * The hamburger, drawn where the online switch sits the rest of the time. Lives
 * in the header (OnlineToggle) rather than here, because the drawer it opens has
 * to be rendered at the shell to cover the screen — a child of the header would
 * be positioned against a strip 92% wide and 40 tall.
 */
export const RideMenuButton = () => {
    const { setOpen } = useRideMenu();

    return (
        <Pressable
            role="button"
            aria-label="Menu"
            onPress={() => setOpen(true)}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            className="flex-row items-center gap-3 rounded-full bg-[var(--background-primary)] p-3"
        >
            <View className="w-[22px] h-[22px] items-center justify-center">
                <Burger size={20} weight="bold" className="text-[var(--foreground)]" />
            </View>
        </Pressable>
    );
};

export const RideMenuDrawer = () => {
    const { open, setOpen } = useRideMenu();
    const { profile } = useDriver();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const close = useCallback(() => setOpen(false), [setOpen]);

    // Android's back button closes the drawer before it navigates anywhere. Without
    // this, back from an open drawer leaves the app while the menu is still up —
    // and the captain's next thought is that the button did nothing, because the
    // screen he lands on has a menu over it too.
    useEffect(() => {
        if (!open) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            close();
            return true;
        });
        return () => sub.remove();
    }, [open, close]);

    const canDrive = profile?.onboarding?.canDrive ?? false;
    const owesRides = (profile?.onboarding?.assignedRides ?? 0) > 0;
    const tabs = useMemo(
        () => tabsFor(canDrive, owesRides).filter((tab) => tab.name !== 'Post'),
        [canDrive, owesRides],
    );

    if (!open) return null;

    return (
        <View style={{ position: 'absolute', inset: 0, zIndex: 80 }}>
            <Animated.View entering={FadeIn.duration(160)} style={{ position: 'absolute', inset: 0 }}>
                <Pressable
                    onPress={close}
                    accessibilityLabel="Close menu"
                    style={{ flex: 1, backgroundColor: 'rgba(11,11,20,0.5)' }}
                />
            </Animated.View>

            <Animated.View
                entering={SlideInRight.duration(240)}
                exiting={SlideOutRight.duration(180)}
                className="bg-[var(--background-primary)]"
                style={{
                    position: 'absolute',
                    right: 0, top: 0, bottom: 0,
                    width: DRAWER_WIDTH,
                    paddingTop: 56,
                    paddingHorizontal: 12,
                    borderTopLeftRadius: 28,
                    borderBottomLeftRadius: 28,
                }}
            >
                <View className="flex-row items-center justify-between px-3 mb-6">
                    <AppText
                        className="text-xl font-semibold text-[var(--foreground)]"
                        style={{ letterSpacing: -0.72 }}
                    >
                        RCS Captains
                    </AppText>
                    <Pressable
                        role="button"
                        aria-label="Close menu"
                        onPress={close}
                        hitSlop={10}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                        <Cross size={22} weight="bold" className="text-[var(--foreground)]" />
                    </Pressable>
                </View>

                {tabs.map((tab) => {
                    const isSelected = pathname === tab.path;

                    return (
                        <Pressable
                            key={tab.name}
                            role="link"
                            onPress={() => {
                                close();
                                navigate(tab.path, { replace: true });
                            }}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                            className={`flex-row items-center gap-4 px-3 py-3.5 rounded-2xl ${isSelected ? 'bg-[var(--background-muted)]' : ''}`}
                        >
                            {/* De-emphasised with OPACITY rather than --text-muted, which
                                is what the bar uses. That token does not clear AA on this
                                dark chrome, and a menu read at a red light deserves better
                                than the bar's smaller labels get away with. */}
                            <View style={{ opacity: isSelected ? 1 : 0.65 }}>
                                <tab.Icon
                                    size={22}
                                    weight={isSelected ? 'fill' : 'regular'}
                                    className="text-[var(--foreground)]"
                                />
                            </View>
                            <AppText
                                className={`text-base text-[var(--foreground)] ${isSelected ? 'font-semibold' : 'font-medium'}`}
                                style={{ opacity: isSelected ? 1 : 0.65 }}
                            >
                                {tab.name}
                            </AppText>
                        </Pressable>
                    );
                })}
            </Animated.View>
        </View>
    );
};

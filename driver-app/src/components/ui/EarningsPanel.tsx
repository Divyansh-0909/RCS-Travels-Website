import { driverCopy as dc } from "../../lib/copy";
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { CaretDownIcon, CheckIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { RidesSummary } from '../../types/enums';
import { rupees } from '../../constants/booking';
import { useTheme } from '../../theme/ThemeContext';

// The one loud thing on the History board, and the only primary-blue surface on it.
// Everything under it is a grey card, so the week's total is the first thing the eye
// lands on and the rows read as the evidence for it.
//
// It is PINNED above the list, not the list's header. That reverses what this comment
// used to say, and the argument it made still stands on its own terms: a captain
// scrolling back through a fortnight is looking at rides, not at a total he has
// already read, and this now spends that space on every screen of the scroll rather
// than on the first. It was changed because the total staying put was wanted more.
// If the History board ever feels cramped, this is the first thing to hand back.
const MUTED = 'text-[rgba(255,255,255,0.8)]';

export type EarningsPeriodKey = 'today' | 'week' | 'month' | 'threeMonths';
export type EarningsPeriodOption = { key: EarningsPeriodKey; label: string };

type Props = {
    summary: RidesSummary;
    period: EarningsPeriodKey;
    periodOptions: EarningsPeriodOption[];
    onPeriodChange: (period: EarningsPeriodKey) => void;
};

const MENU_WIDTH = 184;

const EarningsPanel = ({ summary, period, periodOptions, onPeriodChange }: Props) => {
    const { colors } = useTheme();
    const [menuOpen, setMenuOpen] = useState(false);
    const caretProgress = useRef(new Animated.Value(0)).current;

    const selected = periodOptions.find((option) => option.key === period) ?? periodOptions[0];
    const caretRotation = caretProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    useEffect(() => {
        const animation = Animated.timing(caretProgress, {
            toValue: menuOpen ? 1 : 0,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });

        animation.start();
        return () => animation.stop();
    }, [caretProgress, menuOpen]);

    const choosePeriod = (next: EarningsPeriodKey) => {
        setMenuOpen(false);
        onPeriodChange(next);
    };

    return (
        <View
            className="w-full rounded-3xl bg-primary p-5"
            style={{ overflow: 'visible', zIndex: menuOpen ? 20 : 0 }}
        >
            <View className="flex-row items-end justify-between gap-4">
                <View className="flex-1 gap-2">
                    <View className="self-start" style={{ zIndex: 30 }}>
                        <Pressable
                            role="button"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label={dc("Filter ride history")}
                            onPress={() => setMenuOpen((open) => !open)}
                            className="flex-row items-center gap-1.5 rounded-full bg-[var(--background-primary)] px-3 py-1.5"
                            style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
                        >
                            <AppText className="text-sm font-semibold leading-5 text-white">{selected.label}</AppText>
                            <Animated.View style={{ height: 20, justifyContent: 'center', transform: [{ rotate: caretRotation }] }}>
                                <CaretDownIcon size={13} weight="bold" color={colors.onStrong} />
                            </Animated.View>
                        </Pressable>

                        {menuOpen ? (
                            <View
                                accessibilityViewIsModal
                                className="absolute left-0 rounded-2xl p-1"
                                style={{
                                    top: '100%',
                                    marginTop: 8,
                                    width: MENU_WIDTH,
                                    backgroundColor: colors.surfaceRaised,
                                    borderWidth: 1,
                                    borderColor: colors.borderUi,
                                    boxShadow: '0px 10px 30px rgba(0,0,0,0.22)',
                                    elevation: 10,
                                }}
                            >
                                {periodOptions.map((option) => {
                                    const active = option.key === period;
                                    return (
                                        <Pressable
                                            key={option.key}
                                            role="menuitem"
                                            aria-selected={active}
                                            onPress={() => choosePeriod(option.key)}
                                            className="min-h-11 flex-row items-center justify-between rounded-xl px-3 py-2.5"
                                            style={({ pressed }) => ({
                                                backgroundColor: active || pressed ? colors.surfaceMuted : 'transparent',
                                            })}
                                        >
                                            <AppText className={`text-sm ${active ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                                                {option.label}
                                            </AppText>
                                            {active ? <CheckIcon size={16} weight="bold" color={colors.primary} /> : null}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        ) : null}
                    </View>

                {/* tracking is points here, not em â€” see tailwind.config.js. -1px is
                    the display-type equivalent of the -0.02em the token carries. */}
                <AppText
                    numberOfLines={1}
                    className="text-4xl font-semibold text-white"
                    style={{ letterSpacing: -1 }}
                >
                    {rupees(summary.earned)}
                </AppText>
                </View>

                <View className="items-end">
                    <AppText className="text-3xl font-semibold text-white" style={{ letterSpacing: -0.6 }}>
                        {summary.rides}
                    </AppText>
                    <AppText className={`text-xs ${MUTED}`}>
                        {summary.rides === 1 ? dc("ride done") : dc("rides done")}
                    </AppText>
                </View>
            </View>

        </View>
    );
};

export default EarningsPanel;

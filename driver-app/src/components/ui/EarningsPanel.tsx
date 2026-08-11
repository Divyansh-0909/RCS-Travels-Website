import { View } from 'react-native';
import AppText from '../AppText';
import { RidesSummary } from '../../types/enums';
import { rupees } from '../../constants/booking';

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

type Props = { summary: RidesSummary };

const EarningsPanel = ({ summary }: Props) => (
    <View className="w-full rounded-3xl bg-primary p-5">
        <View className="flex-row items-end justify-between gap-4">
            <View className="flex-1 gap-1">
                <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                    This week
                </AppText>
                {/* tracking is points here, not em — see tailwind.config.js. -1px is
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
                {/* Singular when it is one. A captain who has done exactly one ride
                    this week should not be told he has done "1 rides done". */}
                <AppText className={`text-xs ${MUTED}`}>
                    {summary.rides === 1 ? 'ride done' : 'rides done'}
                </AppText>
            </View>
        </View>
    </View>
);

export default EarningsPanel;

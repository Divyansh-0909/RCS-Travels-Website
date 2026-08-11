import { View } from 'react-native';
import { cssInterop } from 'nativewind';
import { CoinsIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { RidesSummary } from '../../types/enums';
import { rupees } from '../../constants/booking';
import { FIGURE, TILE, TILE_LABEL } from './tile';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Earned = cssInterop(CoinsIcon, asThemed);

// Primary blue, beside the ink wallet. The two are the only saturated surfaces on the
// page and they sit in one row on purpose: money in and money held are the same
// question asked twice, and reading them together is the point of the row.
const MUTED = 'text-[rgba(255,255,255,0.8)]';

type Props = { summary: RidesSummary };

/**
 * What the captain has earned this calendar month, and how many rides it took.
 *
 * NOT EarningsPanel. That one heads the Rides board's History tab, totals the WEEK,
 * and is laid out wide with the ride count off to the right — none of which survives
 * being cut in half. Two components rather than one with a `compact` flag, because
 * the two differ in period, proportion and placement, and a flag that changed all
 * three would only be hiding a second component inside the first.
 *
 * `earned` is fare minus commission — the figure that actually reaches him, and the
 * same one the expanded ride row calls "You keep".
 */
const MonthEarningsCard = ({ summary }: Props) => (
  <View className={`${TILE} bg-primary`}>
    {/* The icon row mirrors the wallet's in size and gap, because the two labels sit
        level and any difference in shape between them reads as one tile being
        slightly wrong. The ALPHA is a touch higher than the wallet's 0.7 on purpose:
        this ground is primary blue rather than near-black, so the same white sits at
        lower contrast on it and needs the extra step to read as level.

        Coins — loose money counted up — against the wallet's closed pouch of money
        already held. That contrast is the whole job of these two glyphs: earned
        versus held, which is the only thing the tiles differ on.

        Not a rupee sign: the figure underneath already opens with ₹, so it would
        just repeat the next line. */}
    <View className="flex-row items-center gap-1.5">
      <Earned size={14} weight="fill" className={MUTED} />
      <AppText className={`${TILE_LABEL} ${MUTED}`}>This month</AppText>
    </View>

    <AppText numberOfLines={1} className="text-2xl font-semibold text-white" style={FIGURE}>
      {rupees(summary.earned)}
    </AppText>

    {/* Under the figure rather than beside it, which is what makes this tile the same
        shape as the wallet. Singular when it is one: a captain who has done exactly
        one ride this month should not be told he has done "1 rides".

        Full white, matching the wallet's bottom line rather than this tile's own
        label. The two bottom lines sit level across the row and are the last thing
        read on each tile, so they carry the same weight of voice; the labels above
        them are the quiet ones. */}
    <AppText className="text-xs font-semibold text-white">
      {summary.rides === 1 ? '1 ride' : `${summary.rides} rides`}
    </AppText>
  </View>
);

export default MonthEarningsCard;

// The shared shape of the two tiles in Account's summary row.
//
// Extracted rather than written twice because the row only works if they match: two
// cards side by side with different padding, different radii or different figure
// sizes read as a mistake long before anyone can say which one is wrong. Change these
// and both move together.

// flex-1 is what halves the row — each tile takes an equal share of whatever is left
// after the gap. Height is not set: the tiles stretch to the taller of the two, which
// is why both of them always draw their third line even when it has little to say.
export const TILE = 'flex-1 rounded-3xl p-4 gap-1';

export const TILE_LABEL = 'text-xs font-semibold uppercase tracking-wide';

// The space between the two tiles, in POINTS rather than a gap-* class — the spacing
// scale is rem and NativeWind's inlineRem is 14, so gap-3 is 10.5pt, not the 12 it
// reads as. Every number on this page that has to relate to another one is written in
// points for that reason.
//
// Equal to Account's PANEL_GAP, which is in turn the Rides board's row gap — so the
// whole page sits on one 8pt rhythm horizontally and vertically. This used to be the
// tighter of the two, back when stacked panels sat 12 apart; it no longer is, and
// nothing depends on the difference.
export const TILE_GAP = 8;

// Tracking in POINTS, not em — see tailwind.config.js. -0.5 is roughly what the
// token's -0.01em comes to at 24px.
//
// text-2xl rather than the 4xl these figures had at full width: half a phone leaves
// about 128px inside the padding, and a captain with a good month can reach
// "₹1,20,000" — nine glyphs, which overflows anything larger and gets silently
// clipped by numberOfLines. Sized for the worst case, not the seeded one.
export const FIGURE = { letterSpacing: -0.5 };

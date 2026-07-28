// Shared chrome for EmptyState and FailureState: the tone map and the secondary
// action, kept in one place so the two can't drift apart.
//
// `tone` follows Skeleton's: "dark" for the booking-flow panels, "light" for the
// account pages, which invert onto --foreground.

export const STATE_TONE = {
    dark: {
        title: "text-[var(--text)]",
        body: "text-[var(--text-muted)]",
        glyph: "text-[var(--text-muted)]/60",
        ring: "border-[var(--foreground)]/15",
        secondary: "border-[var(--foreground)]/30 text-[var(--text)] hover:bg-[var(--foreground)]/10 focus-visible:outline-[var(--foreground)]/70",
    },
    light: {
        title: "text-[var(--background-primary)]",
        body: "text-[var(--background-primary)]/50",
        glyph: "text-[var(--background-primary)]/40",
        ring: "border-[var(--background-primary)]/15",
        // The account pages sit on --foreground (white), so a border keyed to
        // --foreground would be invisible. These key to --background-primary.
        secondary: "border-[var(--background-primary)]/25 text-[var(--background-primary)] hover:bg-[var(--background-primary)]/5 focus-visible:outline-[var(--background-primary)]/50",
    },
};

export const toneOf = (tone) => STATE_TONE[tone] ?? STATE_TONE.dark;

// Where the block sits inside its container.
//   "center"  — centred at every width. For states that own a whole panel or a
//               wide account-page column, with nothing beside them to line up to.
//   "sm-left" — centred on phones, left-aligned from sm up. Matches the booking
//               flow, whose 290/377px column stacks left-aligned cards, notices
//               and toggles that a centred block would not share an edge with.
// The horizontal padding belongs here, not on the component: in "sm-left" it has
// to drop to zero from sm up, or the block sits 16px inside the column while the
// panel heading above it starts at the column edge, and the two don't line up.
// Phones keep the padding, since the block is centred there and needs the gutter.
export const ALIGN = {
    center: { box: "items-center text-center px-4", actions: "items-center" },
    "sm-left": { box: "items-center text-center px-4 sm:items-start sm:text-left sm:px-0", actions: "items-center sm:items-start" },
};

export const alignOf = (align) => ALIGN[align] ?? ALIGN.center;

// An outlined button rather than an underlined link, so the two actions read as
// a primary/secondary pair. Matches Button's geometry exactly (240px, py-2,
// 12px radius) so they stack flush; only the fill and weight differ.
export const SecondaryButton = ({ tone = "dark", label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{ width: "240px", borderRadius: "12px" }}
        className={`${toneOf(tone).secondary} flex items-center justify-center py-2 text-base font-medium
            cursor-pointer border transition-colors duration-300 active:opacity-70
            outline-none focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
        {label}
    </button>
);

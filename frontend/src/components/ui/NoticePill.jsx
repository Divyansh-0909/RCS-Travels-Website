// Fine print that must not be missed. The muted fill follows the borderless
// information surfaces used throughout the booking flow; the full radius keeps
// it compact without making it look like another card.
// The single source of that radius: every notice in the flow renders through
// here, so changing it here changes all of them.
// `dense` holds the phone type size at every breakpoint, for the one place a
// pill shares a row with something else (the distance chip on VehicleSelect):
// at sm:text-sm the notice and the chip together are wider than the 377px
// column they sit in. The size lives here rather than as a className override
// because a caller's `text-xs` and this component's `sm:text-sm` are the same
// specificity — which one wins would be down to Tailwind's output order.
const NoticePill = ({ className = "", dense = false, children }) => (
    <div className={`${className} w-fit max-w-full rounded-full bg-[var(--background-muted)] px-3 py-2 text-left ${dense ? "text-xs" : "text-xs sm:text-sm"} whitespace-nowrap leading-snug text-[var(--text-muted)]`}>
        {children}
    </div>
);

export default NoticePill;

// Pickup → drop route summary inside a filled panel, shared by every screen
// that shows a booking's route. The first comma segment is the stop's title;
// the rest becomes a muted subtitle (omitted when the address has no comma).
// Optional children render below a hairline divider inside the same card —
// use for meta rows (fare, distance, status) that belong to the trip.
//
// Layout: a 12px rail column holds the markers; each dot lines up with its
// address title line (h3 line-height 28px → dot top offset 8px), not the
// center of the whole address block.
const splitAddress = (address) => {
    const [title, ...rest] = (address ?? "").split(",");
    return { title, subtitle: rest.join(",").trim() };
};

// Type scales; dot offsets keep each marker centred on its title line.
const SIZES = {
    md: { title: "", subtitle: "text-sm sm:text-base", dot: "mt-2" },
    sm: { title: "text-base sm:text-lg", subtitle: "text-xs sm:text-sm", dot: "mt-1.5 sm:mt-2" },
    xs: { title: "text-sm sm:text-base", subtitle: "text-xs", dot: "mt-1 sm:mt-1.5" },
};

const Address = ({ title, subtitle, size }) => (
    <div className="min-w-0">
        <h3 className={`w-full ${SIZES[size].title}`}>{title}</h3>
        {subtitle && <p className={`w-full ${SIZES[size].subtitle}`}>{subtitle}</p>}
    </div>
);

const RoutePanel = ({ pickup, drop, className = "", size = "md", children }) => {
    const from = splitAddress(pickup);
    const to = splitAddress(drop);
    const dotOffset = SIZES[size].dot;
    return (
        <div className={`${className} w-full rounded-xl bg-[var(--background-muted)] px-4 py-4 text-left`}>
            <div className="grid grid-cols-[12px_1fr] gap-x-3 w-full">
                <div className={`${dotOffset} w-3 h-3 rounded-full bg-[var(--foreground)] shrink-0`} />
                <div className="pb-3">
                    <Address {...from} size={size} />
                </div>
                <div className={`${dotOffset} w-3 h-3 rounded-full bg-primary relative shrink-0`}>
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--background)]" />
                </div>
                <Address {...to} size={size} />
            </div>
            {children && (
                <>
                    <div className="w-full h-px bg-[var(--foreground)]/10 my-3 sm:my-4" />
                    <div className="w-full flex flex-col gap-2">{children}</div>
                </>
            )}
        </div>
    );
};

export default RoutePanel;

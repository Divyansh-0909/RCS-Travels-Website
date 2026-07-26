// Fine print that must not be missed. Muted fill and foreground hairline like
// the onboarding inputs, but fully rounded — the same pill shape as Share and
// Ride details, so every content-sized chip in the booking flow reads alike.
// The single source of that radius: every notice in the flow renders through
// here, so changing it here changes all of them.
const NoticePill = ({ className = "", children }) => (
    <div className={`${className} w-fit max-w-full rounded-full bg-[var(--background-muted)] border border-[var(--foreground)]/30 px-3 py-2 text-left text-xs sm:text-sm whitespace-nowrap leading-snug text-[var(--text-muted)]`}>
        {children}
    </div>
);

export default NoticePill;

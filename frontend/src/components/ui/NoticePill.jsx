// Fine print that must not be missed. Styled like the onboarding page's
// inputs — muted fill, foreground hairline, 12px radius — so it reads as part
// of the same control family instead of a stray pill.
const NoticePill = ({ className = "", children }) => (
    <div className={`${className} w-fit max-w-full rounded-xl bg-[var(--background-muted)] border border-[var(--foreground)]/30 px-3 py-2 text-left text-xs sm:text-sm whitespace-nowrap leading-snug text-[var(--text-muted)]`}>
        {children}
    </div>
);

export default NoticePill;

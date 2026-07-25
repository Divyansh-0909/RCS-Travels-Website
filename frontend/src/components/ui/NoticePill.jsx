// Fine print that must not be missed — muted surface with a foreground
// hairline so it reads as a deliberate notice, not leftover caption text.
// Sized for one line at the 290px column; longer copy belongs in a card.
const NoticePill = ({ className = "", children }) => (
    <div className={`${className} w-full rounded-full bg-[var(--background-muted)] border border-[var(--foreground)]/30 px-4 py-2 text-center sm:text-left text-xs text-[var(--text-muted)]`}>
        {children}
    </div>
);

export default NoticePill;

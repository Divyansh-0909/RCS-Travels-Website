// Theme-matched on/off switch. Animates only transform + colour.
const Toggle = ({ on, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={`relative w-12 h-7 shrink-0 rounded-full cursor-pointer transition-color duration-300 ${on ? "bg-[var(--background-primary)]" : "bg-[var(--background-primary)]/25"}`}
    >
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--foreground)] transition-transform duration-300 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
)

export default Toggle

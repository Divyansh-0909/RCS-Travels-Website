// Theme-matched on/off switch. Animates only transform + colour.
const Toggle = ({ on, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-checked={on}
        role="switch"
        className={`relative w-12 h-7 shrink-0 rounded-full cursor-pointer transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${on ? "bg-strong" : "bg-border"}`}
    >
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-on-strong transition-transform duration-300 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
)

export default Toggle

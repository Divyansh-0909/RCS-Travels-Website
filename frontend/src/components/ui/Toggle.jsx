// The same flat visual is used by a standalone setting and a clickable row.
export const SwitchVisual = ({ on, className = "" }) => (
    <span aria-hidden="true" data-switch-track className={`relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none ${on ? "bg-strong" : "bg-border"} ${className}`}>
        <span data-switch-thumb className={`absolute top-1 left-1 size-5 rounded-full bg-on-strong transition-transform duration-200 ease-out motion-reduce:transition-none ${on ? "translate-x-5" : "translate-x-0"}`} />
    </span>
)

const Toggle = ({ on, onClick, disabled = false, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-checked={on}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        role="switch"
        className={`relative inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
        <SwitchVisual on={on} />
    </button>
)

export default Toggle

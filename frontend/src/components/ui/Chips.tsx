// Single-select chips + field styles shared by the filter panels. Clicking the active chip deselects it.

export const filterLabel = "text-xs uppercase tracking-wide text-[var(--foreground-muted)]/50 pl-1"
export const filterField = "w-full rounded-xl py-2 px-3 text-sm bg-transparent outline-none border border-[var(--foreground)]/30 placeholder:text-[var(--foreground-muted)]/50"

type ChipOption<T> = {
    label: string
    value: T
}

type ChipsProps<T> = {
    options: ChipOption<T>[]
    value: T | null
    onChange: (value: T | null) => void
}

const Chips = <T,>({ options, value, onChange }: ChipsProps<T>) => (
    <div className="flex flex-wrap gap-2">
        {options.map((o) => (
            <button
                type="button"
                key={String(o.value)}
                onClick={() => onChange(value === o.value ? null : o.value)}
                aria-pressed={value === o.value}
                className={`cursor-pointer select-none rounded-full px-3 py-1.5 text-sm capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${value === o.value
                    ? "bg-primary text-on-strong font-semibold"
                    : "bg-surface-muted text-ink hover:bg-surface-raised"}`}
            >
                {o.label}
            </button>
        ))}
    </div>
)

export default Chips

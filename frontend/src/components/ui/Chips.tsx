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
            <div
                key={String(o.value)}
                onClick={() => onChange(value === o.value ? null : o.value)}
                className={`px-3 py-1.5 rounded-full border text-sm capitalize cursor-pointer select-none transition-colors duration-300 ${value === o.value
                    ? "bg-primary text-[var(--foreground)] border-transparent font-semibold"
                    : "border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/10"}`}
            >
                {o.label}
            </div>
        ))}
    </div>
)

export default Chips

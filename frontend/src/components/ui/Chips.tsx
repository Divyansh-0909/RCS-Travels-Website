// Single-select chips + field styles shared by the filter panels. Clicking the active chip deselects it.
import PillControl from "./PillControl";
import { fieldClass } from "./fieldStyles";

export const filterLabel = "text-xs uppercase tracking-wide text-[var(--foreground-muted)]/50 pl-1"
export const filterField = fieldClass

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
    <div className="flex flex-wrap gap-x-2 gap-y-0">
        {options.map((o) => (
            <PillControl
                type="button"
                key={String(o.value)}
                onClick={() => onChange(value === o.value ? null : o.value)}
                aria-pressed={value === o.value}
                faceClassName={`select-none capitalize ${value === o.value
                    ? "bg-primary text-on-primary font-semibold"
                    : "bg-surface-muted text-ink hover:bg-surface-raised"}`}
            >
                {o.label}
            </PillControl>
        ))}
    </div>
)

export default Chips

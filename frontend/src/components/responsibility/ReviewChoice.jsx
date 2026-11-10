import { ChevronDown } from "lucide-react";
import { cn } from "./utils";
import { compactInputStyles } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

// A fixed choice presented with the same chrome as the review's text fields.
export default function ReviewChoice({
  id,
  label,
  name,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  "aria-describedby": describedBy,
  ...props
}) {
  const selected = options.find(([key]) => key === value)?.[1];
  const valueId = `${id}-value`;
  return (
    <DropdownMenu>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <DropdownMenuTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${selected || placeholder}`}
        aria-describedby={describedBy}
        className={cn(
          compactInputStyles,
          "responsibility-review-choice relative flex h-auto min-h-8 items-center justify-between gap-2 text-left before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']",
        )}
        {...props}
      >
        <span id={valueId} className={cn("min-w-0 flex-1 break-words", !selected && "text-ink-muted")}>
          {selected || placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={label}>
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange} aria-label={label}>
          {options.map(([key, text]) => (
            <DropdownMenuRadioItem key={key} value={key} closeOnClick>
              {text}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

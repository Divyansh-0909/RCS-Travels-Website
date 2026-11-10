import { ChevronDown } from './icons';
import { cn } from '@/components/responsibility/utils';
import { compactInputStyles } from '@/components/responsibility/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/responsibility/ui/dropdown-menu';

// Same field/menu contract as the existing ReviewChoice, with optional MDI icons.
export default function ReviewChoice({ id, label, name, value, onValueChange, options, placeholder, disabled, 'aria-describedby': describedBy, ...props }) {
  const selected = options.find(([key]) => key === value);
  const SelectedIcon = selected?.[2];
  return <DropdownMenu>
    <input type="hidden" name={name} value={value} disabled={disabled} />
    <DropdownMenuTrigger id={id} type="button" disabled={disabled} aria-label={`${label}: ${selected?.[1] || placeholder}`} aria-describedby={describedBy}
      className={cn(compactInputStyles, "responsibility-review-choice relative flex h-auto min-h-8 items-center justify-between gap-2 text-left before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']")} {...props}>
      <span id={`${id}-value`} className={cn('option-label min-w-0 flex-1 break-words', !selected && 'text-ink-muted')}>{SelectedIcon && <SelectedIcon size={16} />}<span>{selected?.[1] || placeholder}</span></span>
      <ChevronDown className="size-4 shrink-0 text-ink-muted" />
    </DropdownMenuTrigger>
    <DropdownMenuContent aria-label={label}><DropdownMenuRadioGroup value={value} onValueChange={onValueChange} aria-label={label}>
      {options.map(([key, text, Icon]) => <DropdownMenuRadioItem key={key} value={key} closeOnClick><span className="option-label">{Icon && <Icon size={16} />}<span>{text}</span></span></DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup></DropdownMenuContent>
  </DropdownMenu>;
}

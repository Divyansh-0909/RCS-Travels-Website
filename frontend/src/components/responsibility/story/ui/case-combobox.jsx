import { Combobox as Primitive } from '@base-ui/react/combobox';
import { ScrollArea } from '@base-ui/react/scroll-area';
import { cn } from '@/components/responsibility/utils';
import { inputFieldStyles } from '@/components/responsibility/ui/input';

// shadcn Base UI combobox composition, using the existing compact RCS input.
export const Combobox = Primitive.Root;
export const ComboboxClear = Primitive.Clear;
export function ComboboxInput({ className, ...props }) { return <Primitive.Input data-slot="input" className={cn(inputFieldStyles, className)} {...props} />; }
export function ComboboxContent({ children, ...props }) {
  return <Primitive.Portal><Primitive.Positioner className="responsibility-layer responsibility-story-layer isolate z-[150]" sideOffset={6} align="start">
    <Primitive.Popup data-slot="combobox-content" className="case-suggestions rounded-lg border border-border bg-surface-raised text-ink shadow-md" {...props}>{children}</Primitive.Popup>
  </Primitive.Positioner></Primitive.Portal>;
}
export function ComboboxList(props) {
  return <ScrollArea.Root className="relative">
    <ScrollArea.Viewport data-slot="case-suggestion-viewport" tabIndex={-1} className="max-h-72 overscroll-contain">
      <ScrollArea.Content><Primitive.List className="p-1" {...props} /></ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar className="case-suggestion-scrollbar"><ScrollArea.Thumb className="case-suggestion-thumb" /></ScrollArea.Scrollbar>
  </ScrollArea.Root>;
}
export function ComboboxItem({ className, ...props }) { return <Primitive.Item className={cn('flex min-h-11 cursor-pointer flex-col items-start justify-center gap-1 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-[var(--responsibility-interaction-background)]', className)} {...props} />; }
export function ComboboxEmpty(props) { return <Primitive.Empty className="p-4 text-sm text-ink-muted empty:hidden" {...props} />; }

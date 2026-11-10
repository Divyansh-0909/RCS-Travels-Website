import { ChevronRight } from '../story/ui/icons';
import { cn } from "../utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

// shadcn Trace / Plan composition, using the existing Radix and RCS tokens.
export function Trace({ className, ...props }) {
  return <div data-slot="trace" className={cn("flex min-w-0 flex-col gap-3", className)} {...props} />;
}

export function TraceLine({ className, ...props }) {
  return <span data-slot="trace-line" className={cn("flex min-w-0 items-start gap-2 text-sm leading-5 text-ink-muted", className)} {...props} />;
}

export function TraceIcon({ className, ...props }) {
  return <span data-slot="trace-icon" aria-hidden="true" className={cn("flex size-4 shrink-0 items-center justify-center [&_svg]:size-4", className)} {...props} />;
}

export function TraceTitle({ className, ...props }) {
  return <span data-slot="trace-title" className={cn("min-w-0 break-words font-medium text-ink", className)} {...props} />;
}

export function TraceDescription({ className, ...props }) {
  return <span data-slot="trace-description" className={cn("text-xs font-normal leading-4 text-ink-muted", className)} {...props} />;
}

export function TraceCollapsible({ className, ...props }) {
  return <Collapsible data-slot="trace-collapsible" className={cn("min-w-0", className)} {...props} />;
}

export function TraceCollapsibleTrigger({ className, children, ...props }) {
  return (
    <CollapsibleTrigger
      data-slot="trace-collapsible-trigger"
      className={cn("group/trace flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg text-left text-sm leading-5 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", className)}
      {...props}
    >
      {children}
      <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-ink-muted group-aria-expanded/trace:rotate-90" />
    </CollapsibleTrigger>
  );
}

export function TraceCollapsibleContent({ className, children, keepMounted = false, ...props }) {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      forceMount={keepMounted || undefined}
      className={keepMounted ? "data-[state=closed]:hidden" : undefined}
      {...props}
    >
      <div className={cn("ml-[calc(0.5rem-1px)] min-w-0 border-l border-border pl-4 text-ink-muted", className)}>{children}</div>
    </CollapsibleContent>
  );
}

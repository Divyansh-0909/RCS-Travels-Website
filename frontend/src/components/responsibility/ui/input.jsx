import * as React from "react";
import { cn } from "@/components/responsibility/utils";

// Shared shadcn field chrome for native inputs, choice fields and textareas.
// The single focus border follows the owner's existing focus preference.
const inputFieldStyles = "w-full min-w-0 rounded-lg border border-border bg-transparent px-2.5 text-base text-ink shadow-none transition-colors motion-reduce:transition-none outline-none placeholder:text-ink-muted focus:border-primary focus-visible:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-surface-muted/50 disabled:opacity-50 aria-invalid:border-negative aria-invalid:focus:border-negative aria-invalid:ring-0 dark:bg-surface-muted/30 dark:disabled:bg-surface-muted/80 md:text-sm";
const compactInputStyles = cn(inputFieldStyles, "h-8 py-1 leading-5");

function Input({ className, type, appearance = "default", ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        appearance === "compact" ? compactInputStyles : [
          "h-12 w-full min-w-0 rounded-xl border border-border bg-[var(--input-background)] px-4 py-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-on-primary file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-[var(--input-placeholder)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus:border-primary focus-visible:border-primary focus-visible:ring-0",
          "aria-invalid:border-negative aria-invalid:ring-negative/20 dark:aria-invalid:ring-negative/40",
        ],
        className,
      )}
      {...props}
    />
  );
}

export { Input, inputFieldStyles, compactInputStyles };

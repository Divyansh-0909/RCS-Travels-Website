import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/components/responsibility/utils";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-base font-medium whitespace-normal break-words transition-colors motion-reduce:transition-none outline-none focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-negative aria-invalid:ring-negative/20 dark:aria-invalid:ring-negative/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-primary/90",
        negative:
          "bg-negative text-white hover:bg-negative/90 focus-visible:ring-negative/20 dark:bg-negative/60 dark:focus-visible:ring-negative/40",
        outline:
          "border border-border bg-surface shadow-xs hover:bg-surface-muted hover:text-ink dark:border-border dark:bg-surface-muted/30 dark:hover:bg-surface-muted/50",
        secondary: "bg-surface-muted text-ink hover:bg-surface-muted/80",
        ghost:
          "hover:bg-surface-muted hover:text-ink dark:hover:bg-surface-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-12 px-5 py-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-11 gap-2 rounded-xl px-3 py-2 text-sm",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

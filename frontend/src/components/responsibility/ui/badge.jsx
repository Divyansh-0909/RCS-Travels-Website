import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/components/responsibility/utils";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "group/badge inline-flex min-h-5 w-fit max-w-full items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0 text-xs font-medium leading-4 whitespace-normal break-words transition-[color,box-shadow] motion-reduce:transition-none focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-negative aria-invalid:ring-negative/20 dark:aria-invalid:ring-negative/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary [a&]:hover:bg-primary/90",
        secondary:
          "bg-surface-muted text-ink dark:bg-strong [a&]:hover:bg-surface-muted/90",
        negative:
          "bg-negative text-white focus-visible:ring-negative/20 dark:bg-negative/60 dark:focus-visible:ring-negative/40 [a&]:hover:bg-negative/90",
        outline:
          "border-border text-ink [a&]:hover:bg-surface-muted [a&]:hover:text-ink",
        ghost: "[a&]:hover:bg-surface-muted [a&]:hover:text-ink",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant = "default", asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

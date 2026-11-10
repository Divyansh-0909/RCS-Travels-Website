"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "@/components/responsibility/utils"

import { CheckIcon } from "./icons"
import type { ComponentProps } from "react"

function CheckMark(props: ComponentProps<typeof CheckIcon>) {
  return <CheckIcon aria-hidden="true" {...props} />
}

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-border after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative aria-invalid:ring-3 aria-invalid:ring-negative/20 aria-invalid:aria-checked:border-primary dark:bg-surface-muted/30 dark:aria-invalid:border-negative/50 dark:aria-invalid:ring-negative/40 data-checked:border-primary data-checked:bg-primary data-checked:text-on-primary group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        aria-hidden="true"
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-3.5"
      >
        <CheckMark />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox, CheckMark }

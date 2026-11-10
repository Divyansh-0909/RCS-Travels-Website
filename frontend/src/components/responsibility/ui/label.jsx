import * as React from "react";
import { cn } from "@/components/responsibility/utils";
import { Label as LabelPrimitive } from "radix-ui";

function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 text-sm leading-6 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

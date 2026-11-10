import * as React from "react";
import { cn } from "@/components/responsibility/utils";
import { inputFieldStyles } from "./input";

function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        inputFieldStyles,
        "flex field-sizing-content min-h-16 max-h-80 resize-y py-2 leading-6 md:leading-5",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

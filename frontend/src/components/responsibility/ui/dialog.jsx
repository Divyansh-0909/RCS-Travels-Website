import { useRef } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { buttonVariants } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ title, description, children }) {
  const titleRef = useRef(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[190] bg-black/60" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        aria-modal="true"
        className="responsibility-layer fixed left-1/2 top-1/2 z-[200] grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] rounded-2xl border border-border bg-surface text-ink shadow-2xl outline-none [overflow-wrap:anywhere]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <div className="relative border-b border-border px-4 py-4 pr-16 sm:px-6 sm:pr-20">
          <DialogPrimitive.Title ref={titleRef} tabIndex={-1} className="text-xl font-medium leading-7 outline-none">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-5 text-ink-muted">
            {description}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close type="button" aria-label="Close details" className={buttonVariants({ variant: "ghost", size: "icon", className: "absolute right-2 top-2 sm:right-3 sm:top-3" })}>
            <X aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        <div data-slot="dialog-body" className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

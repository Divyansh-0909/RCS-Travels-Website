import { useCallback, useRef } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ScrollArea } from '@base-ui/react/scroll-area';
import { X, FileText } from './icons';
import { buttonVariants } from '@/components/responsibility/ui/button';
import { cn } from '@/components/responsibility/utils';
import './record-dialog.css';

// Shadcn-style Base UI dialog primitives retain focus and the CSS transition lifecycle.
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({ title, description, children, restoreFocus, icon: HeadingIcon = FileText, className }) {
  const titleRef = useRef(null);
  const lockRecordHeight = useCallback(node => {
    if (node?.classList.contains('record-details-dialog') && !node.style.height && node.offsetHeight) {
      node.style.height = `${node.offsetHeight}px`;
    }
  }, []);
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Backdrop data-slot="dialog-overlay" className="responsibility-story-layer review-dialog-overlay fixed inset-0 z-[190] bg-black/60" />
    <DialogPrimitive.Popup
      ref={lockRecordHeight}
      data-slot="dialog-content" aria-modal="true"
      className={cn("responsibility-layer responsibility-story-layer review-dialog fixed left-1/2 top-1/2 z-[200] grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] rounded-2xl border border-border text-ink outline-none [overflow-wrap:anywhere]", className)}
      initialFocus={titleRef}
      finalFocus={restoreFocus ? () => restoreFocus() ?? true : undefined}>
      <div className="review-dialog-header flex items-start gap-4 border-b border-border p-4">
        <div className="grid min-w-0 flex-1 gap-1">
          <DialogPrimitive.Title ref={titleRef} tabIndex={-1} className="icon-heading text-lg font-medium leading-6 outline-none"><HeadingIcon size={16} />{title}</DialogPrimitive.Title>
          {description && <DialogPrimitive.Description className="text-sm leading-5 text-ink-muted">{description}</DialogPrimitive.Description>}
        </div>
        <DialogPrimitive.Close type="button" data-slot="button" data-variant="outline" data-motion-press="true" aria-label="Close details"
          className={buttonVariants({ variant: 'outline', size: 'icon-sm', className: 'review-dialog-close size-9 shrink-0 rounded-lg' })}>
          <X aria-hidden="true" />
        </DialogPrimitive.Close>
      </div>
      <ScrollArea.Root className="review-dialog-scroll relative min-h-0">
        <ScrollArea.Viewport data-slot="dialog-body" className="h-full min-h-0 overscroll-contain p-4 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
          <ScrollArea.Content style={{ minWidth: 0 }}>{children}</ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar data-slot="dialog-scrollbar" className="review-dialog-scrollbar">
          <ScrollArea.Thumb className="review-dialog-scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </DialogPrimitive.Popup>
  </DialogPrimitive.Portal>;
}

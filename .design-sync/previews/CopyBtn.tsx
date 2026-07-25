import { CopyBtn } from 'rcs-travels-frontend';

// Hover-copy affordance used beside ride IDs and phone numbers in the admin
// dashboard and ride history. The "copy" tooltip is hover-only, so it does not
// appear in a static capture — the icon is what these cells show.

const Light = ({ children }: { children?: any }) => (
  <div className="bg-[var(--foreground)] text-[var(--text-foreground)] p-6 flex flex-col gap-3 text-base">
    {children}
  </div>
);

export const Default = () => (
  <Light>
    <span>
      Ride ID: <span className="font-medium">bk_8f2a41c9</span> <CopyBtn value="bk_8f2a41c9" onCopy={() => {}} />
    </span>
  </Light>
);

export const InDetailRows = () => (
  <Light>
    <span>
      Ride ID: <span className="font-medium">bk_8f2a41c9</span> <CopyBtn value="bk_8f2a41c9" onCopy={() => {}} />
    </span>
    <span>
      Rider: <span className="font-medium">98765 43210</span> <CopyBtn value="9876543210" onCopy={() => {}} />
    </span>
    <span>
      Driver: <span className="font-medium">91234 56780</span> <CopyBtn value="9123456780" onCopy={() => {}} />
    </span>
  </Light>
);

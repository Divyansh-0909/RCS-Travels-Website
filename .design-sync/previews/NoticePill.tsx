import { NoticePill } from 'rcs-travels-frontend';

// One-line fine print on the dark booking flow — muted surface with a
// foreground hairline. Copy ported from VehicleSelect's toll notice.

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] p-6 w-[340px] flex flex-col gap-3">
    {children}
  </div>
);

export const Default = () => (
  <Dark>
    <NoticePill>Tolls payable to driver separately</NoticePill>
  </Dark>
);

export const WithInlineAction = () => (
  <Dark>
    <NoticePill>
      Driver asking extra?{' '}
      <button type="button" className="underline underline-offset-2 text-[var(--text)]">
        Report it
      </button>
    </NoticePill>
  </Dark>
);

export const Stacked = () => (
  <Dark>
    <NoticePill>Tolls payable to driver separately</NoticePill>
    <NoticePill>Carrier charge applies for rooftop luggage</NoticePill>
  </Dark>
);

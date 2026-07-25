import { DateTimeSelector } from 'rcs-travels-frontend';

// Calendar + time field used inside the booking form's schedule dropdown.
// Uncontrolled: `initial` seeds it, `onChange` fires on every date/time edit
// and `onConfirm` on the confirm action. The fixed capture clock makes the
// rendered month deterministic.

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background-primary)] text-[var(--text)] p-4 w-[320px] rounded-2xl">
    {children}
  </div>
);

export const Default = () => (
  <Dark>
    <DateTimeSelector onClick={() => {}} onChange={() => {}} onConfirm={() => {}} />
  </Dark>
);

export const WithInitialDate = () => (
  <Dark>
    <DateTimeSelector
      initial={new Date('2024-05-22T17:30:00')}
      onClick={() => {}}
      onChange={() => {}}
      onConfirm={() => {}}
    />
  </Dark>
);

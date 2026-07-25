import { Input } from 'rcs-travels-frontend';

// Everything arrives through the `prop` bag; `onChangeFn` receives the raw
// string, not the event. leading is decorative, trailing interactive.
// Compositions ported from LoginPage / SignUpPage.

const MDI_CLOSE = 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z';

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] p-8 flex flex-col items-start gap-5">
    {children}
  </div>
);

export const Default = () => (
  <Dark>
    <Input
      prop={{
        type: 'tel',
        name: 'phone-number',
        id: 'phone-number',
        placeholder: 'XXXXX XXXXX',
        value: '',
        onChangeFn: () => {},
        bg: 'var(--background-muted)',
      }}
    />
  </Dark>
);

export const Filled = () => (
  <Dark>
    <Input
      prop={{
        type: 'tel',
        name: 'phone',
        placeholder: 'XXXXX XXXXX',
        value: '98765 43210',
        onChangeFn: () => {},
        bg: 'var(--background-muted)',
      }}
    />
  </Dark>
);

export const ErrorState = () => (
  <Dark>
    <Input
      prop={{
        type: 'tel',
        name: 'phone',
        placeholder: 'XXXXX XXXXX',
        value: '9876',
        onChangeFn: () => {},
        error: true,
        bg: 'var(--background-muted)',
      }}
    />
  </Dark>
);

export const WithAdornments = () => (
  <Dark>
    <Input
      prop={{
        type: 'text',
        name: 'pickup',
        placeholder: 'Pickup location',
        value: 'Shiv Nadar University',
        onChangeFn: () => {},
        bg: 'var(--background-muted)',
      }}
      leading={<span className="block w-2.5 h-2.5 rounded-full bg-[var(--foreground)]" />}
      trailing={
        <svg viewBox="0 0 24 24" width="18" height="18" className="text-[var(--text-muted)]">
          <path fill="currentColor" d={MDI_CLOSE} />
        </svg>
      }
    />
  </Dark>
);

import { ErrorPanel } from 'rcs-travels-frontend';

// Full-screen error sheet: an ErrorMark illustration, the message, and an
// Okay button, over a dimming scrim. It is driven entirely by `prop.error` —
// a non-null message opens it. `prop.setError` clears it; `prop.onOkay`
// overrides the default navigate-away behaviour.

const Stage = ({ children }: { children?: any }) => (
  <div className="relative w-[420px] h-[720px] overflow-hidden bg-[var(--background)] text-[var(--text)]">
    {children}
  </div>
);

export const Open = () => (
  <Stage>
    <ErrorPanel prop={{ error: 'We could not reach the server', setError: () => {}, onOkay: () => {} }} />
  </Stage>
);

export const NoDriverFound = () => (
  <Stage>
    <ErrorPanel
      prop={{ error: 'No drivers available right now', setError: () => {}, onOkay: () => {} }}
    />
  </Stage>
);

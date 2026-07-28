import { RefreshNotice } from 'rcs-travels-frontend';

// Ambient staleness pill. In the app it is mounted bare in main.jsx and reads
// the useRefreshNotice store; passing a `notice` drives it directly, which is
// what these previews do (same shape as ErrorPanel taking its message as a prop).
//
// It exists for the case between FailureState and silence: a background fetch
// failed, but usable content (persisted profile, the last poll's status) is
// still on screen. Anchored top-centre, since the bottom slot belongs to
// RideCancelledToast and the "Copied to clipboard" pills.

const Stage = ({ children }: { children?: any }) => (
  <div className="relative w-[420px] h-[260px] overflow-hidden bg-[var(--background)] text-[var(--text)]">
    {children}
  </div>
);

export const WithRetry = () => (
  <Stage>
    <RefreshNotice
      notice={{
        message: "Couldn't refresh your profile. Showing your last saved details.",
        onRetry: () => {},
      }}
    />
  </Stage>
);

export const DismissOnly = () => (
  <Stage>
    <RefreshNotice
      notice={{ message: "Couldn't refresh your ride. Showing the last update we got." }}
    />
  </Stage>
);

export const ShortMessage = () => (
  <Stage>
    <RefreshNotice
      notice={{ message: "Couldn't check whether you have a ride booked.", onRetry: () => {} }}
    />
  </Stage>
);

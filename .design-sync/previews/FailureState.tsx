import { FailureState } from 'rcs-travels-frontend';

// The content could not be loaded. Distinct from EmptyState (nothing to show,
// nothing wrong) and RefreshNotice (stale content still on screen). Keeps
// ErrorMark, the project's error badge, and always offers a retry.
// Copy contract: `title` says what failed in the rider's terms, `detail`
// carries the server's own words underneath.

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] w-[420px] py-4">{children}</div>
);

const Light = ({ children }: { children?: any }) => (
  <div className="bg-[var(--foreground)] text-[var(--text-foreground)] w-[560px] py-4">{children}</div>
);

export const CouldNotLoadRides = () => (
  <Light>
    <FailureState
      tone="light"
      title="Couldn't load your rides"
      detail="Server error (503)"
      onRetry={() => {}}
    />
  </Light>
);

export const Retrying = () => (
  <Light>
    <FailureState
      tone="light"
      title="Couldn't load bookings"
      detail="Server error (500)"
      onRetry={() => {}}
      retrying
    />
  </Light>
);

export const CouldNotPriceRoute = () => (
  <Dark>
    <FailureState
      tone="dark"
      title="Couldn't price this route"
      detail="Couldn't reach the server to price this route."
      onRetry={() => {}}
      secondaryAction={{ label: 'Change your route', onClick: () => {} }}
    />
  </Dark>
);

// What the ErrorBoundary renders on an unhandled render throw.
export const AppCrash = () => (
  <Dark>
    <FailureState
      tone="dark"
      title="This page stopped responding"
      detail="Reloading usually clears it. Your booking is safe — nothing was lost."
      onRetry={() => {}}
      retryLabel="Reload the page"
      secondaryAction={{ label: 'Go to the home page', onClick: () => {} }}
    />
  </Dark>
);

// Tight surfaces can drop the badge down; everything else stays put.
export const CompactBadge = () => (
  <Dark>
    <FailureState
      tone="dark"
      title="Couldn't load your ride"
      detail="Couldn't reach the server"
      onRetry={() => {}}
      size={96}
    />
  </Dark>
);

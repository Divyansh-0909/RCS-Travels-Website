import { EmptyState } from 'rcs-travels-frontend';

// Zero-content state. `tone` follows Skeleton's: "dark" for the booking-flow
// panels, "light" for the account pages, which invert onto --foreground.
// No mark by default: "nothing here yet" explains itself, and an error badge
// over it would read as a fault the user caused. `glyph="search"` is the one
// exception, marking a query that matched nothing rather than an empty account.
// The secondary action is an outlined button, not an underlined link.

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] w-[420px] py-4">{children}</div>
);

const Light = ({ children }: { children?: any }) => (
  <div className="bg-[var(--foreground)] text-[var(--text-foreground)] w-[560px] py-4">{children}</div>
);

export const NoRidesYet = () => (
  <Light>
    <EmptyState
      tone="light"
      title="No rides yet"
      message="Your trips show up here once you book one, with the driver's details and what you paid."
      action={{ label: 'Book a ride', onClick: () => {} }}
    />
  </Light>
);

export const NothingMatchedFilters = () => (
  <Light>
    <EmptyState
      tone="light"
      glyph="search"
      title="No rides match your search"
      message="Try a wider date range, or clear what's set to see every ride."
      secondaryAction={{ label: 'Clear filters', onClick: () => {} }}
    />
  </Light>
);

export const NoRouteSet = () => (
  <Dark>
    <EmptyState
      tone="dark"
      title="No route set"
      message="Tell us where you're starting from and where you're headed, and we'll price it."
      action={{ label: 'Set your route', onClick: () => {} }}
    />
  </Dark>
);

// Both actions at once: the primary way forward plus the way back.
export const RouteNotPriced = () => (
  <Dark>
    <EmptyState
      tone="dark"
      title="We don't price this route yet"
      message="This drop-off isn't on our rate card. Message us and we'll quote it by hand."
      action={{ label: 'Ask us for a fare', onClick: () => {} }}
      secondaryAction={{ label: 'Change your route', onClick: () => {} }}
    />
  </Dark>
);

// No action at all — the admin tabs, where there is nothing for the viewer to do.
export const Bare = () => (
  <Light>
    <EmptyState
      tone="light"
      title="No drivers registered yet"
      message="Drivers appear here once they sign up and submit their vehicle details for approval."
    />
  </Light>
);

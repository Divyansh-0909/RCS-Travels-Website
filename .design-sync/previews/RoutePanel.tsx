import { RoutePanel } from 'rcs-travels-frontend';

// pickup/drop are raw address strings — the panel splits on the first comma
// into a title line and a muted subtitle. Children render under a divider as
// meta rows; the fare/distance pattern below is the one used on VehicleSelect
// and TrackingPage. Dark booking-flow surface.

const PICKUP = 'Shiv Nadar University, Dadri, Gautam Buddha Nagar';
const DROP = 'Indira Gandhi International Airport, Terminal 3, New Delhi';

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] p-6 w-[360px] flex flex-col gap-4">
    {children}
  </div>
);

export const Default = () => (
  <Dark>
    <RoutePanel pickup={PICKUP} drop={DROP} />
  </Dark>
);

export const WithFareRows = () => (
  <Dark>
    <RoutePanel size="sm" pickup={PICKUP} drop={DROP}>
      <div className="flex items-center justify-between w-full">
        <h4 className="text-base sm:text-lg text-[var(--text-muted)]">Fare</h4>
        <h4 className="text-base sm:text-lg">₹2,400</h4>
      </div>
      <div className="flex items-center justify-between w-full">
        <h4 className="text-base sm:text-lg text-[var(--text-muted)]">Distance</h4>
        <h4 className="text-base sm:text-lg">62.4 km</h4>
      </div>
    </RoutePanel>
  </Dark>
);

export const Sizes = () => (
  <Dark>
    <RoutePanel size="md" pickup={PICKUP} drop={DROP} />
    <RoutePanel size="sm" pickup={PICKUP} drop={DROP} />
    <RoutePanel size="xs" pickup={PICKUP} drop={DROP} />
  </Dark>
);

export const CompactWithCode = () => (
  <Dark>
    <RoutePanel size="xs" pickup={PICKUP} drop={DROP}>
      <div className="flex items-center justify-between w-full">
        <h4 className="text-sm sm:text-base text-[var(--text-muted)]">Fare</h4>
        <h4 className="text-sm sm:text-base">₹2,400</h4>
      </div>
      <div className="flex items-center justify-between w-full">
        <h4 className="text-sm sm:text-base text-[var(--text-muted)]">Booking code</h4>
        <h4 className="text-sm sm:text-base tracking-[0.25em] -mr-[0.25em]">481629</h4>
      </div>
    </RoutePanel>
  </Dark>
);

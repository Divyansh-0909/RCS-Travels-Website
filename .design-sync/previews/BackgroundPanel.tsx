import { BackgroundPanel, RoutePanel, Button } from 'rcs-travels-frontend';

// The booking flow's sheet surface: pinned to the bottom of a positioned
// parent, full-viewport width, with the radial .bg-panel-gradient. It animates
// in when `show` turns true and stays mounted through the fade-out, so a
// static capture shows the settled open state.

const Stage = ({ children }: { children?: any }) => (
  <div className="relative w-[420px] h-[720px] overflow-hidden bg-[var(--background)] text-[var(--text)]">
    {children}
  </div>
);

export const Open = () => (
  <Stage>
    <BackgroundPanel show className="flex flex-col items-center justify-center gap-4 px-6">
      <h2>Confirm your ride</h2>
      <p>Review the route before you book.</p>
    </BackgroundPanel>
  </Stage>
);

export const WithBookingContent = () => (
  <Stage>
    <BackgroundPanel show className="flex flex-col items-center justify-center gap-5 px-6">
      <RoutePanel
        size="sm"
        pickup="Shiv Nadar University, Dadri, Gautam Buddha Nagar"
        drop="Indira Gandhi International Airport, Terminal 3, New Delhi"
      >
        <div className="flex items-center justify-between w-full">
          <h4 className="text-base text-[var(--text-muted)]">Fare</h4>
          <h4 className="text-base">₹2,400</h4>
        </div>
      </RoutePanel>
      <Button prop={{ variant: '', width: '290px' }}>Confirm booking</Button>
    </BackgroundPanel>
  </Stage>
);

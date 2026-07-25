import { Button } from 'rcs-travels-frontend';

// Every style decision arrives through the `prop` bag, not top-level props.
// Compositions ported from OnBoarding.jsx (the booking form) and the
// cancel/confirm panels. Button lives on the dark booking-flow surface, so
// each cell supplies it — the DS ships no body background on purpose.

const Dark = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] p-6 flex flex-col items-start gap-3">
    {children}
  </div>
);

export const Primary = () => (
  <Dark>
    <Button prop={{ variant: '', width: '290px' }}>Track Ride</Button>
  </Dark>
);

export const Variants = () => (
  <Dark>
    <Button prop={{ variant: '', width: '290px' }}>Confirm booking</Button>
    <Button prop={{ variant: 'negative', width: '290px' }}>Cancel ride</Button>
    <Button prop={{ variant: 'input', width: '290px', bg: 'var(--background-primary)' }}>
      Book another ride
    </Button>
    <Button prop={{ variant: 'dropdown', width: '290px' }}>Pickup now</Button>
  </Dark>
);

export const AsFormField = () => (
  <Dark>
    <Button
      prop={{ variant: 'input', width: '290px', bg: 'var(--background-primary)' }}
      innerClassName="justify-start px-4"
    >
      Shiv Nadar University, Greater Noida
    </Button>
    <Button
      prop={{ variant: 'input', width: '290px', bg: 'var(--background-primary)', error: true }}
      innerClassName="justify-start px-4"
    >
      Enter a drop location
    </Button>
  </Dark>
);

export const States = () => (
  <Dark>
    <Button prop={{ variant: '', width: '290px' }}>Enabled</Button>
    <Button prop={{ variant: '', width: '290px', disabled: true }}>Disabled</Button>
    <Button prop={{ variant: 'input', width: '290px', error: true }}>Error</Button>
    <Button prop={{ variant: 'input', width: '290px', disabled: true }}>Outline disabled</Button>
  </Dark>
);

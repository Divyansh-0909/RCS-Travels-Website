import { Chips } from 'rcs-travels-frontend';

// Single-select filter chips from the admin dashboard panels. Clicking the
// active chip deselects it, so `value` may be null. The selected chip takes
// the brand primary; the rest are outlined.

const Panel = ({ children }: { children?: any }) => (
  <div className="bg-[var(--background)] text-[var(--text)] p-6 w-[380px] flex flex-col gap-4">
    {children}
  </div>
);

const STATUS = [
  { value: 'pending', label: 'pending' },
  { value: 'assigned', label: 'assigned' },
  { value: 'completed', label: 'completed' },
  { value: 'cancelled', label: 'cancelled' },
];

export const Selected = () => (
  <Panel>
    <Chips options={STATUS} value={'completed'} onChange={() => {}} />
  </Panel>
);

export const NoSelection = () => (
  <Panel>
    <Chips options={STATUS} value={null} onChange={() => {}} />
  </Panel>
);

export const VehicleFilter = () => (
  <Panel>
    <Chips
      options={[
        { value: 4, label: 'Cab Economy' },
        { value: 6, label: 'Cab XL' },
      ]}
      value={4}
      onChange={() => {}}
    />
  </Panel>
);

export const SourceFilter = () => (
  <Panel>
    <Chips
      options={[
        { value: 'website', label: 'Website' },
        { value: 'whatsapp', label: 'WhatsApp' },
        { value: 'admin', label: 'Admin' },
      ]}
      value={'whatsapp'}
      onChange={() => {}}
    />
  </Panel>
);

import { Toggle } from 'rcs-travels-frontend';

// On/off switch used in the trailing slot of a SettingRow. Light account
// surface — the track is --background-primary at full/25% alpha.

const Light = ({ children }: { children?: any }) => (
  <div className="bg-[var(--foreground)] text-[var(--text-foreground)] p-6 flex items-center gap-6">
    {children}
  </div>
);

export const On = () => (
  <Light>
    <Toggle on={true} onClick={() => {}} />
  </Light>
);

export const Off = () => (
  <Light>
    <Toggle on={false} onClick={() => {}} />
  </Light>
);

export const Both = () => (
  <Light>
    <div className="flex items-center gap-3">
      <Toggle on={true} onClick={() => {}} />
      <span className="text-base">On</span>
    </div>
    <div className="flex items-center gap-3">
      <Toggle on={false} onClick={() => {}} />
      <span className="text-base">Off</span>
    </div>
  </Light>
);

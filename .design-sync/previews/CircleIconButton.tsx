import { CircleIconButton } from 'rcs-travels-frontend';

// Round action button at the end of a settings row — the "+" opener, the edit
// pencil, the download tray. Takes an MDI path string via `icon`. Path data is
// inlined here so the preview carries no icon-package import.

const MDI_PLUS = 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z';
const MDI_PENCIL =
  'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z';
const MDI_DOWNLOAD = 'M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z';

const Light = ({ children }: { children?: any }) => (
  <div className="bg-[var(--foreground)] text-[var(--text-foreground)] p-6 flex items-center gap-4">
    {children}
  </div>
);

export const Default = () => (
  <Light>
    <CircleIconButton icon={MDI_PLUS} onClick={() => {}} />
  </Light>
);

export const Icons = () => (
  <Light>
    <CircleIconButton icon={MDI_PLUS} onClick={() => {}} />
    <CircleIconButton icon={MDI_PENCIL} size={0.8} onClick={() => {}} />
    <CircleIconButton icon={MDI_DOWNLOAD} size={0.9} onClick={() => {}} />
  </Light>
);

export const Disabled = () => (
  <Light>
    <CircleIconButton icon={MDI_PLUS} onClick={() => {}} />
    <CircleIconButton icon={MDI_PLUS} disabled onClick={() => {}} />
  </Light>
);

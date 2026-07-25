import { SettingRow, Toggle, CircleIconButton } from 'rcs-travels-frontend';

// SettingRow renders an <li> — it must be composed inside a <ul>, which is why
// a bare render comes up blank. It belongs to the LIGHT account surface
// (SettingsPage / ManageAccount): white background, --text-foreground text,
// with --background-primary carrying the accent at low alpha.
// mdiCheck / mdiPencil path data is inlined so the preview owns no icon import.

const MDI_CHECK = 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z';
const MDI_PENCIL =
  'M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z';

const Light = ({ children }: { children?: any }) => (
  <div className="bg-[var(--foreground)] text-[var(--text-foreground)] p-6 w-[520px]">
    <ul className="flex flex-col gap-3 w-full">{children}</ul>
  </div>
);

export const Default = () => (
  <Light>
    <SettingRow>
      <h4 className="text-lg font-medium">Ride updates</h4>
      <p className="text-base text-[var(--background-primary)]/50">
        Driver assigned, arrival and drop alerts
      </p>
    </SettingRow>
  </Light>
);

export const WithToggle = () => (
  <Light>
    <SettingRow trailing={<Toggle on={true} onClick={() => {}} />}>
      <h4 className="text-lg font-medium">Ride updates</h4>
      <p className="text-base text-[var(--background-primary)]/50">
        Driver assigned, arrival and drop alerts
      </p>
    </SettingRow>
    <SettingRow trailing={<Toggle on={false} onClick={() => {}} />}>
      <h4 className="text-lg font-medium">Offers and promotions</h4>
      <p className="text-base text-[var(--background-primary)]/50">
        Occasional discounts on airport runs
      </p>
    </SettingRow>
  </Light>
);

export const Selectable = () => (
  <Light>
    <SettingRow
      onClick={() => {}}
      trailing={
        <div className="p-1 rounded-full bg-[var(--background-primary)] text-[var(--foreground)]">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d={MDI_CHECK} />
          </svg>
        </div>
      }
    >
      <h4 className="text-lg font-medium">English</h4>
      <p className="text-base text-[var(--background-primary)]/50">Default</p>
    </SettingRow>
    <SettingRow
      onClick={() => {}}
      trailing={
        <div className="p-1 rounded-full border border-[var(--background-primary)]/25 text-transparent">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d={MDI_CHECK} />
          </svg>
        </div>
      }
    >
      <h4 className="text-lg font-medium">हिन्दी</h4>
      <p className="text-base text-[var(--background-primary)]/50">Hindi</p>
    </SettingRow>
  </Light>
);

export const SavedPlaces = () => (
  <Light>
    <SettingRow trailing={<CircleIconButton icon={MDI_PENCIL} size={0.8} onClick={() => {}} />}>
      <p className="text-base text-[var(--background-primary)]/50">Home</p>
      <h4 className="text-lg font-medium">Ashoka Enclave, Sector 34, Noida</h4>
    </SettingRow>
    <SettingRow trailing={<CircleIconButton icon={MDI_PENCIL} size={0.8} onClick={() => {}} />}>
      <p className="text-base text-[var(--background-primary)]/50">Work</p>
      <h4 className="text-lg font-medium">Not added yet</h4>
    </SettingRow>
  </Light>
);

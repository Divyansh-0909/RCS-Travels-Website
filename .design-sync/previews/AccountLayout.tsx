import { AccountLayout, SettingRow, Toggle } from 'rcs-travels-frontend';

// The account-area shell: RCS wordmark and breadcrumb title across the top, a
// left rail of section names, and the selected section's content on the right.
// It fills the viewport (100vw/100vh) and sits on the LIGHT surface, so the
// card renders at a desktop viewport. Navigation comes from the router the
// preview provider supplies.

export const Settings = () => (
  <AccountLayout
    title="Settings"
    items={['Language', 'Notifications', 'Saved places']}
    selected={1}
    onSelect={() => {}}
  >
    <ul className="flex flex-col gap-3 w-full px-4 overflow-y-auto">
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
    </ul>
  </AccountLayout>
);

export const ManageAccount = () => (
  <AccountLayout
    title="Manage Account"
    items={['Profile', 'Ride history', 'Saved places', 'Security']}
    selected={0}
    onSelect={() => {}}
  >
    <ul className="flex flex-col gap-3 w-full px-4 overflow-y-auto">
      <SettingRow>
        <p className="text-base text-[var(--background-primary)]/50">Full name</p>
        <h4 className="text-lg font-medium">Aarav Sharma</h4>
      </SettingRow>
      <SettingRow>
        <p className="text-base text-[var(--background-primary)]/50">Phone</p>
        <h4 className="text-lg font-medium">98765 43210</h4>
      </SettingRow>
      <SettingRow>
        <p className="text-base text-[var(--background-primary)]/50">Email</p>
        <h4 className="text-lg font-medium">Not added yet</h4>
      </SettingRow>
    </ul>
  </AccountLayout>
);

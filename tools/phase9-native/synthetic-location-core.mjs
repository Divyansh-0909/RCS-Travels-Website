// Test transport only. The caller supplies real permission methods, never native
// position methods. No owner GPS source can be reached through this adapter.
export function createSyntheticLocation({ permission, read, schedule = setInterval, cancel = clearInterval }) {
  const current = async () => {
    if (!(await permission()).granted) throw new Error('Foreground permission denied');
    const fixture = await read();
    if (fixture.schema !== 'phase9-synthetic-location-v1' || fixture.source !== 'synthetic-delhi') throw new Error('Unknown GPS fixture');
    if (fixture.unavailable) throw new Error('Synthetic location unavailable');
    const fix = fixture.fix;
    if (!fix || !Number.isFinite(fix.timestamp) || !Number.isFinite(fix.coords?.accuracy)
      || !Number.isFinite(fix.coords.latitude) || !Number.isFinite(fix.coords.longitude)
      || fix.coords.latitude < 28.5 || fix.coords.latitude > 28.8
      || fix.coords.longitude < 77.1 || fix.coords.longitude > 77.4) throw new Error('GPS fixture outside synthetic boundary');
    return fix;
  };
  return {
    getCurrentPositionAsync: current,
    async getLastKnownPositionAsync() { try { return await current(); } catch { return null; } },
    async watchPositionAsync(_options, listener) {
      let active = true;
      const deliver = async () => { try { const fix = await current(); if (active) listener(fix); } catch { /* no fabricated fix */ } };
      await deliver();
      const handle = schedule(deliver, 1000);
      return { remove() { active = false; cancel(handle); } };
    },
    async hasStartedLocationUpdatesAsync() { return false; },
    async startLocationUpdatesAsync() { throw new Error('Native background GPS collection disabled in this synthetic fixture'); },
    async stopLocationUpdatesAsync() {},
  };
}

// Developer fixture recovery only. Never rebind or remove another port mapping.
export async function ensureNativePreviewForwards(device, ports) {
  if (ports.length !== 2 || new Set(ports).size !== 2 || ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535)) throw Error('Expected two owned fixture ports');
  const bindings = (await device.adb('reverse', '--list')).trim().split(/\r?\n/).filter(Boolean).map(line => line.trim().split(/\s+/).slice(-2));
  for (const port of ports) {
    const local = 'tcp:' + port;
    if (bindings.some(([from, to]) => from === local && to !== local)) throw Error('Owned fixture port has a conflicting reverse mapping');
  }
  let restored = 0;
  for (const port of ports) {
    const local = 'tcp:' + port;
    if (!bindings.some(([from, to]) => from === local && to === local)) {
      await device.adb('reverse', '--no-rebind', local, local); restored++;
    }
  }
  return restored;
}

export async function nativePreviewHealth(native, request = fetch) {
  const metro = new URL(new URL(native.launchUrl).searchParams.get('url'));
  const gateway = new URL(native.gateway.url);
  for (const url of [metro, gateway]) if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) throw Error('Only owned loopback fixture endpoints');
  const restoredForwards = await ensureNativePreviewForwards(native.device, [Number(gateway.port), Number(metro.port)]);
  const [packager, backend] = await Promise.all([
    request(new URL('/status', metro), { signal: AbortSignal.timeout(3000) }),
    request(new URL('/phase9-health', gateway), { signal: AbortSignal.timeout(3000) }),
  ]);
  const body = backend.ok ? await backend.json() : null;
  return { healthy: packager.ok && (await packager.text()).includes('packager-status:running') && body?.mode === 'isolated-phase9' && body.production === false, restoredForwards };
}

import { systemClock } from '../../lib/clock.js'

export const connectivityState = Object.freeze({
  ONLINE: 'online', OFFLINE: 'offline', DEGRADED: 'degraded', UNKNOWN: 'unknown',
})

/** An ordered signal journal; missing GPS never implies an offline choice. */
export function createConnectivityEvidence({ clock = systemClock } = {}) {
  const events = []
  const record = (signal, value, at = clock.now(), source = 'server') => {
    const entry = { signal, value, at: new Date(at), source }
    events.push(entry)
    events.sort((a, b) => a.at - b.at)
    return structuredClone(entry)
  }
  const history = () => structuredClone(events)
  const latest = (signal) => history().filter(entry => entry.signal === signal).at(-1) ?? null
  return { record, history, latest, reset: () => { events.length = 0 } }
}

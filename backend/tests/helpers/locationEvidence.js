import { systemClock } from '../../lib/clock.js'

const copy = value => structuredClone(value)

/** Preserve device observation and server receipt as separate evidence. */
export function createLocationEvidence({ clock = systemClock } = {}) {
  const samples = []
  const add = ({ driverId, latitude, longitude, accuracyMeters, observedAt = clock.now(),
    receivedAt = clock.now(), source = 'device_gps', deviceId = null }) => {
    const sample = { driverId, latitude, longitude, accuracyMeters,
      observedAt: new Date(observedAt), receivedAt: new Date(receivedAt), source, deviceId }
    samples.push(sample)
    samples.sort((a, b) => a.observedAt - b.observedAt)
    return copy(sample)
  }
  const history = (driverId) => copy(samples.filter(sample => sample.driverId === driverId))
  const latest = (driverId) => history(driverId).at(-1) ?? null
  const ageMs = (sample) => clock.now().getTime() - sample.observedAt.getTime()
  return { add, history, latest, ageMs, reset: () => { samples.length = 0 } }
}

/** Route and ETA progress are evidence only; thresholds belong to later policy tests. */
export function pickupProgress({ originalEtaMinutes, currentEtaMinutes,
  originalDistanceKm, currentDistanceKm }) {
  return {
    originalEtaMinutes, currentEtaMinutes,
    etaProgressMinutes: originalEtaMinutes - currentEtaMinutes,
    originalDistanceKm, currentDistanceKm,
    routeDistanceProgressKm: originalDistanceKm - currentDistanceKm,
  }
}

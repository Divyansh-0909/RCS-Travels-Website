const ISO_WITH_TIME_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

const millisecondsFor = (iso) => {
  if (typeof iso !== 'string' || !ISO_WITH_TIME_ZONE.test(iso)) {
    throw new TypeError('Test clock time must be an ISO string with a timezone')
  }

  const milliseconds = Date.parse(iso)
  if (Number.isNaN(milliseconds)) throw new TypeError('Test clock time must be a valid ISO timestamp')
  return milliseconds
}

export const createTestClock = (initialIso) => {
  let milliseconds = millisecondsFor(initialIso)

  return {
    now: () => new Date(milliseconds),
    set: (iso) => { milliseconds = millisecondsFor(iso) },
    advance: (ms) => {
      if (!Number.isFinite(ms)) throw new TypeError('Test clock advance must be finite milliseconds')
      const advanced = milliseconds + ms
      if (Number.isNaN(new Date(advanced).getTime())) throw new RangeError('Test clock advance exceeds Date range')
      milliseconds = advanced
    },
  }
}

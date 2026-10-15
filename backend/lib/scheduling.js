/** Shared existing scheduled-booking validation; callers supply their controlled time. */
export function parseScheduleTime(date, value, now) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match || +match[1] > 23 || +match[2] > 59) return null
  const scheduled = new Date(`${date}T${match[1].padStart(2, '0')}:${match[2]}:00+05:30`)
  if (scheduled.getTime() <= now.getTime() + 30 * 60000) return { error: 'too_soon' }
  if (scheduled.getTime() > now.getTime() + 7 * 86400000) return { error: 'too_far' }
  return { value: scheduled.toISOString(), label: scheduled.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }) }
}

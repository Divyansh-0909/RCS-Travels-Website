export function parseIncoming(message) {
  if (message.type === 'location') return { type: 'location', lat: Number(message.location?.latitude), lng: Number(message.location?.longitude) }
  if (message.type === 'interactive') return { type: 'choice', value: (message.interactive.button_reply ?? message.interactive.list_reply)?.id }
  if (message.type === 'text') {
    const value = message.text?.body?.trim() ?? ''
    return { type: 'text', value, lower: value.toLowerCase() }
  }
  return { type: 'unsupported' }
}

export async function resolveLocation(input) {
  const query = input.type === 'location' ? `${input.lat},${input.lng}` : input.value
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=en&region=in&key=${process.env.GOOGLE_MAPS_API_KEY}`)
  const body = await response.json()
  const row = body.results?.[0]
  if (!response.ok || body.status !== 'OK' || !row) throw new Error('LOCATION_NOT_FOUND')
  return { address: row.formatted_address, lat: row.geometry.location.lat, lng: row.geometry.location.lng }
}

export function parseScheduleDate(value, now = new Date()) {
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) { const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value); if (local) match = [local[0], local[3], local[2], local[1]] }
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const chosen = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10)
  const max = new Date(now.getTime() + 7 * 86400000 + 330 * 60000).toISOString().slice(0, 10)
  if (chosen < today) return { error: 'past' }
  if (chosen > max) return { error: 'too_far' }
  return { value: chosen }
}

export function parseScheduleTime(date, value, now = new Date()) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match || +match[1] > 23 || +match[2] > 59) return null
  const scheduled = new Date(`${date}T${match[1].padStart(2, '0')}:${match[2]}:00+05:30`)
  if (scheduled.getTime() <= now.getTime() + 30 * 60000) return { error: 'too_soon' }
  if (scheduled.getTime() > now.getTime() + 7 * 86400000) return { error: 'too_far' }
  return { value: scheduled.toISOString(), label: scheduled.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) }
}

const labelledValue = (text, labels) => {
  const match = new RegExp(`^\\s*(?:${labels})\\s*(?::|=|-)\\s*(.+?)\\s*$`, 'im').exec(text)
  return match?.[1]?.trim() || null
}

const trimBookingDetails = value => {
  const markers = [
    /[,\s]+(?=(?:sharing|share\s+ride|(?:roof|luggage)\s+carrier|carrier)\s*[:=-])/i,
    /\s+(?=(?:with(?:out)?|using|taking|choose|prefer|want|need|add|require|no)\s+(?:(?:a|the)\s+)?(?:safe(?:r)?\s+route|sharing|shared?\s+ride|(?:(?:roof|luggage)\s+)?carrier)\b)/i,
    /,\s*(?=(?:now|today|tomorrow|scheduled?|on\s+\d|at\s+\d|(?:(?:prefer\s+)?safe(?:r)?\s+route|route\s+preference|vehicle|car|mode|ride\s*type|date|time)\s*[:=-]|premium\s+suv|hatchback|sedan|suv|solo|private|share|sharing|shared|pool(?:ing)?|safe(?:r)?\s+route|fastest\s+route|standard\s+route)\b)/i,
    /\s+(?=(?:now|today|tomorrow|scheduled?\b|on\s+\d{1,4}[/-]|at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b|(?:(?:prefer\s+)?safe(?:r)?\s+route|route\s+preference|vehicle|car|mode|ride\s*type|date|time)\s*[:=-]|premium\s+suv|hatchback|sedan|suv|solo|private|share|sharing|shared|pool(?:ing)?|safe(?:r)?\s+route|fastest\s+route|standard\s+route)\b)/i,
  ]
  let end = value.length
  for (const marker of markers) {
    const match = marker.exec(value)
    if (match && match.index < end) end = match.index
  }
  return value.slice(0, end).replace(/[,.\s]+$/, '').trim()
}

export const timeFromText = text => {
  const labelled = labelledValue(text, 'time')
  const source = labelled || text
  let match = /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(a\.?m\.?|p\.?m\.?))?\b/i.exec(source)
  if (!match) match = /\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(source)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '')
  if (meridiem) {
    if (hour > 12) return null
    if (hour === 12) hour = 0
    if (meridiem === 'pm') hour += 12
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const dateFromText = (text, now) => {
  const labelled = labelledValue(text, '(?:travel\\s*)?date')
  const explicit = labelled?.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/)?.[0] ??
    text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/)?.[0]
  if (explicit) return parseScheduleDate(explicit, now)
  const lower = text.toLowerCase()
  if (!/\b(today|tomorrow)\b/.test(lower)) return null
  const offset = /\btomorrow\b/.test(lower) ? 1 : 0
  return { value: new Date(now.getTime() + (330 * 60000) + (offset * 86400000)).toISOString().slice(0, 10) }
}

const vehicleFromText = text => {
  if (/\bpremium\s+suv\b/i.test(text)) return 'suv_premium'
  if (/\b(?:hatchback|hatch|mini|economy)\b/i.test(text)) return 'hatchback'
  if (/\bsedan\b/i.test(text)) return 'sedan'
  if (/\bsuv\b/i.test(text)) return 'suv'
  return null
}

const sharingFromText = text => {
  const labels = 'mode|sharing|share\\s+ride'
  const labelled = labelledValue(text, labels) ||
    new RegExp('(?:' + labels + ')\\s*(?::|=|-)\\s*([^,.\\n]+)', 'i').exec(text)?.[1]?.trim()
  if (labelled) {
    if (/^(?:no|off|false|solo|private|not\s+shared?)$/i.test(labelled)) return false
    if (/^(?:yes|on|true|share|shared|sharing|pool|pooling)$/i.test(labelled)) return true
    return undefined
  }
  if (/\b(?:solo|private)(?:\s+ride)?\b/i.test(text) ||
      /\b(?:without|no)\s+(?:a\s+)?(?:shared?|sharing)(?:\s+ride)?\b/i.test(text) ||
      /\b(?:do\s+not|don['’]?t)\s+(?:want\s+to\s+)?share\b/i.test(text)) return false
  if (/\b(?:share|shared|sharing|pool|pooling)(?:\s+ride)?\b/i.test(text)) return true
  return undefined
}

const carrierFromText = text => {
  const labels = '(?:roof|luggage)\\s+carrier|carrier'
  const labelled = labelledValue(text, labels) ||
    new RegExp('(?:' + labels + ')\\s*(?::|=|-)\\s*([^,.\\n]+)', 'i').exec(text)?.[1]?.trim()
  if (labelled) {
    if (/^(?:no|off|false|none|not\s+needed|not\s+required)$/i.test(labelled)) return false
    if (/^(?:yes|on|true|needed|required|add)$/i.test(labelled)) return true
    return undefined
  }
  if (/\b(?:without|no)\s+(?:a\s+|the\s+)?(?:roof\s+|luggage\s+)?carrier\b/i.test(text) ||
      /\b(?:do\s+not|don['’]?t)\s+(?:(?:want|need|use|add|require)\s+)?(?:a\s+|the\s+)?(?:roof\s+|luggage\s+)?carrier\b/i.test(text)) return false
  if (/\b(?:need|want|use|add|require|with)\s+(?:a\s+|the\s+)?(?:(?:roof|luggage)\s+)?carrier\b/i.test(text) ||
      /\b(?:roof|luggage)\s+carrier\b/i.test(text)) return true
  return undefined
}

const safeRouteFromText = text => {
  const labels = '(?:prefer\\s+)?safe(?:r)?\\s+route|route\\s+preference'
  const labelled = labelledValue(text, labels) ||
    new RegExp('(?:' + labels + ')\\s*(?::|=|-)\\s*([^,.\\n]+)', 'i').exec(text)?.[1]?.trim()
  if (labelled) {
    if (/^(?:no|off|false|none|not\s+needed|fastest|quickest|standard|default)(?:\s+route)?$/i.test(labelled)) return false
    if (/^(?:yes|on|true|safe|safer|preferred?|required|needed|highway)(?:\s+route)?$/i.test(labelled)) return true
    return undefined
  }
  if (/\b(?:without|skip|no|not)\s+(?:a\s+|the\s+)?safe(?:r)?\s+route\b/i.test(text) ||
      /\b(?:do\s+not|don['’]?t)\s+(?:(?:want|need|use|take|choose|prefer)\s+)?(?:a\s+|the\s+)?safe(?:r)?\s+route\b/i.test(text) ||
      /\b(?:fastest|standard|default)\s+route\b/i.test(text)) return false
  if (/\b(?:use|take|choose|prefer|want|with|via)?\s*(?:the\s+)?safe(?:r)?\s+route\b/i.test(text)) return true
  return undefined
}

// Parses both a predictable labelled message and a natural sentence such as:
// "Book a sedan solo from Sector 18 Noida to IGI Airport tomorrow at 6:30 pm".
// It deliberately extracts only fields with strong signals; uncertain details
// stay missing and the normal conversation asks for them.
export function parseBookingMessage(value, now = new Date()) {
  const text = String(value || '').trim()
  let pickupText = labelledValue(text, 'pickup(?:\\s+location)?|pick\\s*up(?:\\s+location)?|from')
  let dropText = labelledValue(text, 'drop(?:-?off)?(?:\\s+location)?|destination(?:\\s+location)?|to')
  if (!pickupText || !dropText) {
    const route = /\bfrom\s+(.+?)\s+to\s+(.+)/i.exec(text.replace(/\s+/g, ' '))
    if (route) {
      pickupText ||= route[1].replace(/^[\s,:-]+|[\s,:-]+$/g, '')
      dropText ||= trimBookingDetails(route[2])
    }
  }

  const vehicleClass = vehicleFromText(text)
  const sharing = sharingFromText(text)
  const needsCarrier = carrierFromText(text)
  const preferSafeRoute = safeRouteFromText(text)
  const when = labelledValue(text, 'when|ride\s*type|trip\s*type')
  const explicitNow = /\b(?:now|right\s+now|asap|immediately)\b/i.test(text) ||
    /^\s*(?:now|ride\s+now)\s*$/i.test(when || text)
  const explicitScheduled = /\b(?:schedule|scheduled|today|tomorrow)\b/i.test(text) || /^\s*scheduled?\s*$/i.test(when || '') ||
    /\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/.test(text)
  const scheduleDate = dateFromText(text, now)
  const scheduleTime = timeFromText(text)
  const rideType = explicitNow ? 'now' : (explicitScheduled || scheduleDate || scheduleTime) ? 'scheduled' : undefined
  const data = { ...(rideType && { rideType }), ...(pickupText && { pickupText }), ...(dropText && { dropText }),
    ...(vehicleClass && { vehicleClass }), ...(sharing !== undefined && { sharing }),
    ...(needsCarrier !== undefined && { needsCarrier }),
    ...(preferSafeRoute !== undefined && { preferSafeRoute }) }
  const issues = {}
  if (scheduleDate?.value) data.scheduleDate = scheduleDate.value
  else if (scheduleDate?.error) issues.scheduleDate = scheduleDate.error
  if (scheduleTime) data.scheduleTime = scheduleTime
  if (data.scheduleDate && data.scheduleTime) {
    const parsed = parseScheduleTime(data.scheduleDate, data.scheduleTime, now)
    if (parsed?.value) Object.assign(data, { scheduledAt: parsed.value, scheduleLabel: parsed.label })
    else if (parsed?.error) issues.scheduleTime = parsed.error
  }

  const labelled = /^(?:\s*(?:pickup(?:\s+location)?|pick\s*up(?:\s+location)?|from|drop(?:-?off)?(?:\s+location)?|destination(?:\s+location)?|to|date|time|when|vehicle|car|cab|mode|ride\s*type|sharing|share\s+ride|(?:roof|luggage)\s+carrier|carrier|(?:prefer\s+)?safe(?:r)?\s+route|route\s+preference)\s*(?::|=|-))/im.test(text)
  const bookingWords = /\b(?:book|booking|cab|taxi|ride)\b/i.test(text)
  const hasDetails = Boolean(pickupText || dropText || vehicleClass || sharing !== undefined || needsCarrier !== undefined ||
    preferSafeRoute !== undefined || rideType)
  return { isBookingRequest: labelled || Boolean(pickupText && dropText) || (bookingWords && hasDetails), data, issues }
}

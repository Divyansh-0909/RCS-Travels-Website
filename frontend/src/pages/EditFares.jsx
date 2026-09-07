import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import { useApi } from '../hooks/useApi'
import EmptyState from '../components/ui/EmptyState'
import FailureState from '../components/ui/FailureState'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import './EditFares.css'

// The owner-facing zone editor, ported from tools/rcs-fare-zones.html. Same
// layout, same Hinglish, same mechanism — the one thing that changed is where a
// save goes: it used to download a zones.geojson to send back over WhatsApp, and
// now it PUTs to /api/admin/zones, which reprices every ride on the next
// request. The copy that described the file round trip had to follow.

// ---------- pricing rules, mirrored from the website ----------
// The provider edits one source number only. Every other class is calculated
// from the Wagon R fare, exactly as rideEstimate.js prices the customer cards.
// Keeping the derivation here lets the owner inspect every class without
// creating override fields that the live estimator deliberately ignores.
const derive = {
    hatchback: (h) => h,
    sedan: (h) => h + 100,
    suv: (h) => Math.round((h * 1.6) / 50) * 50,
    suv_premium: (h) => Math.round((h * 2.75) / 50) * 50,
}

const fareFor = (props, cls) => {
    const hatchback = props.fares?.hatchback
    return hatchback == null ? null : derive[cls]?.(hatchback) ?? null
}

const CLASSES = [
    { key: 'hatchback', get "label"() { return dc("Wagon R"); }, shortLabel: 'Wagon R', scale: derive.hatchback },
    { key: 'sedan', get "label"() { return dc("Sedan"); }, shortLabel: 'Sedan', scale: derive.sedan },
    { key: 'suv', get "label"() { return dc("Ertiga"); }, shortLabel: 'Ertiga', scale: derive.suv },
    { key: 'suv_premium', get "label"() { return dc("Innova Crysta"); }, shortLabel: 'Premium', scale: derive.suv_premium },
]

// Fare bands drive zone colors so the pricing geography is visible at a glance.
// Green is cheap, red is dear — the one colour scale nobody has to be taught.
// The thresholds are scaled by the same rule the prices are, so switching car
// keeps the same colour geography instead of turning the whole map red.
const BANDS = [
    { max: 500, color: '#2FBF71' },
    { max: 800, color: '#8CC63F' },
    { max: 1100, color: '#E8C13F' },
    { max: 1400, color: '#F2913D' },
    { max: 1700, color: '#E0603A' },
    { max: Infinity, color: '#C8362F' },
]

// ---------------------------------------------------------------------------
// THE ONE PLACE THE TWO COORDINATE ORDERS MEET — mirrors backend/services/geo.js.
//
// GeoJSON positions are [lng, lat]; Leaflet latlngs and every point in this app
// are { lat, lng }. The three functions below are the only ones here that index
// a position, so no call site carries an order it could state backwards. That
// matters more than it looks: a point in NCR is lat 28, lng 77, and both are
// legal latitudes, so a swap is never rejected — it just tests outside every
// polygon, silently, forever.
// ---------------------------------------------------------------------------

/** Ray casting: is this { lat, lng } inside this GeoJSON linear ring? */
function pointInRing({ lat, lng }, ring) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
            inside = !inside
    }
    return inside
}

// Mean of a ring's vertices, as a point. Only ever used to ask "roughly where is
// this shape" — on a concave zone it can land outside the polygon itself.
const ringCentroid = (ring) => {
    const sum = ring.reduce((acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 })
    return { lat: sum.lat / ring.length, lng: sum.lng / ring.length }
}

/** A GeoJSON ring as the [lat, lng] pairs L.polygon wants. */
const ringToLatLngs = (ring) => ring.map(([lng, lat]) => [lat, lng])

const fmt = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'))
const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// Positions in, positions out — deliberately order-agnostic, so this is not a
// fourth place that has to know which number is which.
const roundRing = (ring) => ring.map((pos) => pos.map((n) => +n.toFixed(5)))
const ringOf = (z) => z.layer.toGeoJSON().geometry.coordinates[0]

// Shared input chrome, so the fare boxes and the notes field cannot drift apart.
const field =
    'w-full rounded-xl border border-[var(--background-primary)]/15 bg-[var(--foreground-muted)] px-3 py-2 text-[var(--text-foreground)] outline-none transition-colors duration-300 focus-visible:border-primary'
const labelCls = 'block text-xs text-gray-500 mt-3 mb-1'

const EditFares = () => {
    useCopyLanguage();
    const api = useApi()

    const mapRef = useRef(null)
    const mapNodeRef = useRef(null)
    /** zones: [{ props, layer }] — props is the feature's properties object, kept verbatim. */
    const zonesRef = useRef([])
    const selectedRef = useRef(null)
    // What the rate card looked like when it was loaded, so the save screen can
    // list what actually changed rather than asking him to remember.
    const baselineRef = useRef(new Map())

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)
    const [ready, setReady] = useState(false)
    const [reloadKey, setReloadKey] = useState(0)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState(null)
    const [meta, setMeta] = useState(null)
    const [status, setStatus] = useState('Load ho raha hai…')
    const [activeClass, setActiveClass] = useState('hatchback')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState(null)
    const [probe, setProbe] = useState(null)
    const [modal, setModal] = useState(null)
    // Layers are mutable objects Leaflet owns, so edits to them are invisible to
    // React. Bumping this is what the old refreshAll() did — one redraw signal.
    const [, setTick] = useState(0)
    const bump = useCallback(() => setTick((t) => t + 1), [])

    const bandColor = useCallback(
        (fare) => {
            if (fare == null) return '#8b8b9d'
            const scale = CLASSES.find((c) => c.key === activeClass).scale
            return BANDS.find((b) => fare <= (b.max === Infinity ? Infinity : scale(b.max))).color
        },
        [activeClass],
    )

    const zoneStyle = useCallback(
        (z, active) => {
            const c = bandColor(fareFor(z.props, activeClass))
            return {
                color: active ? '#ffffff' : c,
                weight: active ? 3 : 2,
                fillColor: c,
                fillOpacity: active ? 0.45 : 0.28,
            }
        },
        [activeClass, bandColor],
    )

    const labelHtml = useCallback(
        (z) => `${escapeHtml(z.props.name)} <span class="rs">${fmt(fareFor(z.props, activeClass))}</span>`,
        [activeClass],
    )

    const refreshZone = useCallback(
        (z) => {
            z.layer.setStyle(zoneStyle(z, z === selectedRef.current))
            z.layer.setTooltipContent(labelHtml(z))
        },
        [zoneStyle, labelHtml],
    )

    // ---------- change tracking ----------
    const snapshot = (z) => JSON.stringify({ p: z.props, r: roundRing(ringOf(z)) })
    const captureBaseline = useCallback(() => {
        baselineRef.current = new Map(zonesRef.current.map((z) => [z, snapshot(z)]))
    }, [])
    const isChanged = (z) => !baselineRef.current.has(z) || baselineRef.current.get(z) !== snapshot(z)

    const changeList = useCallback(() => {
        const out = []
        const live = new Set(zonesRef.current)
        for (const [z] of baselineRef.current)
            if (!live.has(z)) out.push({ kind: 'del', get "text"() { return dc("<strong>{{value0}}</strong> hata diya", {value0: (escapeHtml(z.props.name))}); } })
        for (const z of zonesRef.current) {
            if (!baselineRef.current.has(z)) {
                out.push({
                    kind: 'add',
                    get "text"() { return dc("Naya area <strong>{{value0}}</strong> — {{value1}}", {value0: (escapeHtml(z.props.name)), value1: (fmt(z.props.fares?.hatchback))}); },
                })
                continue
            }
            const was = JSON.parse(baselineRef.current.get(z))
            if (snapshot(z) === baselineRef.current.get(z)) continue
            const bits = []
            if (was.p.name !== z.props.name) bits.push(`naam pehle “${escapeHtml(was.p.name)}” tha`)
            const oldHatchback = was.p.fares?.hatchback
            const newHatchback = z.props.fares?.hatchback
            if (oldHatchback !== newHatchback) bits.push(`Wagon R ${fmt(oldHatchback)} → ${fmt(newHatchback)}`)
            if ((was.p.toll ?? 0) !== (z.props.toll ?? 0)) bits.push(`toll ${fmt(was.p.toll ?? 0)} → ${fmt(z.props.toll ?? 0)}`)
            if (JSON.stringify(was.r) !== JSON.stringify(roundRing(ringOf(z)))) bits.push('shape badli')
            if ((was.p.notes ?? '') !== (z.props.notes ?? '')) bits.push('notes badle')
            if (bits.length) out.push({ kind: 'mod', get "text"() { return dc("<strong>{{value0}}</strong> — {{value1}}", {value0: (escapeHtml(z.props.name)), value1: (bits.join(', '))}); } })
        }
        return out
    }, [])

    // ---------- what the website would charge here ----------
    // A faithful copy of backend/services/fareZones.js. It has to stay faithful:
    // the whole point of the checker is that it answers with the real fare,
    // including the boundary-averaging rule, which is not something you can guess
    // by looking at the map.
    const matchZone = useCallback((point) => {
        const hits = zonesRef.current
            .filter((z) => pointInRing(point, ringOf(z)))
            .map((z) => ({
                name: z.props.name,
                priority: z.props.priority ?? 0,
                fares: z.props.fares ?? {},
                toll: z.props.toll ?? 0,
            }))
        if (!hits.length) return null
        hits.sort((a, b) => b.priority - a.priority)

        const [top, second] = hits
        const isBorder =
            second &&
            top.priority - second.priority <= 1 &&
            second.fares.hatchback != null &&
            second.fares.hatchback !== top.fares.hatchback
        if (!isBorder) return top

        const fares = {
            hatchback: Math.round((top.fares.hatchback + second.fares.hatchback) / 2 / 50) * 50,
        }
        return {
            name: `${top.name} / ${second.name} border`,
            priority: top.priority,
            fares,
            toll: Math.max(top.toll, second.toll),
            blended: true,
            pair: [top.name, second.name],
        }
    }, [])

    const select = useCallback(
        (z) => {
            const prev = selectedRef.current
            if (prev && prev !== z) prev.layer.pm.disable()
            selectedRef.current = z
            zonesRef.current.forEach(refreshZone)
            if (z) z.layer.pm.enable()
            setSelected(z)
            bump()
        },
        [refreshZone, bump],
    )

    const addZone = useCallback(
        (feature, layer) => {
            const incoming = feature.properties ?? {}
            // Old cards may still carry the three now-dead derived columns.
            // Drop them on load so each subsequent save persists one source of
            // truth while preserving the rest of the zone exactly as received.
            const hatchback = incoming.fares?.hatchback
            const z = {
                props: {
                    ...incoming,
                    fares: hatchback == null ? {} : { hatchback },
                },
                layer,
            }
            layer.addTo(mapRef.current)
            layer.setStyle(zoneStyle(z, false))
            layer.bindTooltip(labelHtml(z), { permanent: true, direction: 'center', className: 'zone-label' })
            layer.on('click', (e) => {
                L.DomEvent.stop(e)
                select(z)
            })
            zonesRef.current.push(z)
            return z
        },
        [zoneStyle, labelHtml, select],
    )

    // ---------- map boot ----------
    // Runs once. Everything the handlers below need is read through a ref, so the
    // map is never torn down and rebuilt just because a fare changed.
    useEffect(() => {
        const map = L.map(mapNodeRef.current, { zoomControl: true }).setView([28.52, 77.35], 10)
        mapRef.current = map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            maxZoom: 19,
        }).addTo(map)
        map.pm.setGlobalOptions({ allowSelfIntersection: false })

        // ---------- label density ----------
        // Labels stay hidden until you have zoomed into somewhere specific — all
        // 67 at once, zoomed out, is just names stacked on names.
        //
        // A step earlier on a phone, where the map is 55% of a small screen: far
        // fewer zones fit in frame at any given zoom, so the labels stop colliding
        // sooner — and pinching your way in on a touchscreen is a lot more work
        // than a scroll wheel. Whole steps only: zoomSnap is at its default of 1,
        // so getZoom() is an integer here and a .5 threshold would behave exactly
        // like the integer above it.
        const narrow = window.matchMedia('(max-width: 640px)')
        const syncLabels = () =>
            mapNodeRef.current?.classList.toggle('hide-labels', map.getZoom() < (narrow.matches ? 11 : 12))
        map.on('zoomend', syncLabels)
        // Rotating the phone crosses the breakpoint, so the threshold has to follow.
        narrow.addEventListener('change', syncLabels)
        syncLabels()

        setReady(true)

        return () => {
            narrow.removeEventListener('change', syncLabels)
            map.remove()
            mapRef.current = null
            zonesRef.current = []
            selectedRef.current = null
            setReady(false)
        }
    }, [])

    // ---------- load the live rate card ----------
    useEffect(() => {
        if (!ready) return
        let cancelled = false
        setLoading(true)
        setLoadError(null)
        api.getFareZones()
            .then((data) => {
                if (cancelled) return
                if (data?.error) {
                    setLoadError(data.error)
                    setStatus('Rate card load nahi ho paaya.')
                    return
                }
                zonesRef.current.forEach((z) => z.layer.remove())
                zonesRef.current = []
                selectedRef.current = null
                data.features.forEach((f) => {
                    if (f.geometry?.type !== 'Polygon') return
                    addZone(f, L.polygon(ringToLatLngs(f.geometry.coordinates[0])))
                })
                captureBaseline()
                setSelected(null)
                setMeta(data.meta ?? null)
                if (zonesRef.current.length)
                    mapRef.current.fitBounds(L.featureGroup(zonesRef.current.map((z) => z.layer)).getBounds().pad(0.05))
                setStatus(
                    `${zonesRef.current.length} area load ho gaye. Jab tak aap “Save karke live karein” nahi dabate, website par kuch nahi badlega.`,
                )
                bump()
            })
            .catch((e) => {
                if (!cancelled) {
                    setLoadError(e instanceof Error ? e.message : 'Something went wrong')
                    setStatus('Rate card load nahi ho paaya.')
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // useApi returns a fresh object every render, so it cannot be a dependency
        // without refetching on every keystroke. The load runs once the map exists,
        // and again only when Dobara koshish karein bumps reloadKey.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, reloadKey])

    // Re-colour and re-label every zone when the car switch moves. Separate from
    // the loader so switching class never refetches.
    useEffect(() => {
        if (!ready) return
        zonesRef.current.forEach(refreshZone)
        bump()
    }, [activeClass, ready, refreshZone, bump])

    // ---------- price checker + drawing ----------
    // Rebound whenever the handlers change identity, so the probe always prices
    // against the zone list as it stands right now.
    useEffect(() => {
        const map = mapRef.current
        if (!map || !ready) return

        // A Leaflet latlng is already { lat, lng }, so it goes straight in.
        const onClick = (e) => {
            if (map.pm.globalDrawModeEnabled()) return
            setProbe(matchZone(e.latlng) ?? 'none')
        }

        const onCreate = (e) => {
            map.pm.disableDraw()
            // Centre of the drawn shape, good enough to ask "what is this sitting inside".
            const centre = ringCentroid(e.layer.toGeoJSON().geometry.coordinates[0])

            // Overlap order decides which price wins, and getting it wrong misprices
            // the area silently — no error, just an averaged fare nobody asked for.
            // So it is never typed in: it is worked out from an answer he can
            // actually give.
            const inside = zonesRef.current
                .filter((z) => pointInRing(centre, ringOf(z)))
                .sort((a, b) => (b.props.priority ?? 0) - (a.props.priority ?? 0))[0]

            let priority = 5
            if (inside) {
                const keep = !window.confirm(
                    `Yeh area “${inside.props.name}” ke andar hai, jahan ${fmt(inside.props.fares?.hatchback)} lagta hai.\n\n` +
                        `OK — yahan alag rate lagana hai.\nCancel — ${fmt(inside.props.fares?.hatchback)} hi rehne dein.`,
                )
                if (keep) {
                    e.layer.remove()
                    setStatus(`Kuch nahi joda — us jagah par ${inside.props.name} wala rate hi rahega.`)
                    return
                }
                priority = (inside.props.priority ?? 0) + 2
            }

            const z = addZone({ properties: { name: 'Naya area', priority, fares: {} } }, e.layer)
            select(z)
            setStatus('Naya area ban gaya — ab iska naam aur Wagon R ka rate bhar dein.')
        }

        map.on('click', onClick)
        map.on('pm:create', onCreate)
        return () => {
            map.off('click', onClick)
            map.off('pm:create', onCreate)
        }
    }, [ready, matchZone, addZone, select])

    // ---------- form bindings ----------
    // One editable source. Sedan, Ertiga and Innova Crysta are always derived
    // for display and are never persisted as competing prices.
    const onHatchback = (value) => {
        const z = selectedRef.current
        const f = (z.props.fares = z.props.fares ?? {})
        if (value === '') delete f.hatchback
        else f.hatchback = +value
        refreshZone(z)
        bump()
    }

    const deleteZone = () => {
        const z = selectedRef.current
        if (!z) return
        if (!window.confirm(`“${z.props.name}” hata dein? Wahan ki ride ka kiraya phir distance ke hisaab se lagega.`)) return
        z.layer.remove()
        zonesRef.current = zonesRef.current.filter((x) => x !== z)
        selectedRef.current = null
        select(null)
    }

    const startDraw = () => {
        select(null)
        mapRef.current.pm.enableDraw('Polygon', { snappable: true, finishOn: 'dblclick' })
        setStatus('Boundary ke har mod par map ko tap karein. Aakhri point par do baar tap karke area band kar dein.')
    }

    // ---------- save ----------
    const openSave = () => {
        if (!zonesRef.current.length) {
            window.alert(dc("Abhi save karne ko kuch nahi hai."))
            return
        }
        setSaveError(null)
        setModal({
            changes: changeList(),
            unpriced: zonesRef.current.filter((z) => !z.props.name || z.props.fares?.hatchback == null).length,
        })
    }

    const confirmSave = async () => {
        setSaving(true)
        setSaveError(null)
        const fc = {
            type: 'FeatureCollection',
            features: zonesRef.current.map((z) => {
                const geo = z.layer.toGeoJSON().geometry
                geo.coordinates = geo.coordinates.map(roundRing)
                return { type: 'Feature', properties: z.props, geometry: geo }
            }),
        }
        try {
            const res = await api.saveFareZones(fc)
            if (res?.error) {
                setSaveError(res.error)
                return
            }
            captureBaseline()
            setMeta({ updatedAt: res.updatedAt, updatedBy: res.updatedBy })
            setModal(null)
            setStatus(`Live ho gaya — ab se har nayi ride in hi rates par lagegi. ${res.count} area save hue.`)
            bump()
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'Save nahi ho paaya. Dobara koshish karein.')
        } finally {
            setSaving(false)
        }
    }

    // ---------- derived view data ----------
    const q = search.trim().toLowerCase()
    const visible = [...zonesRef.current]
        .filter((z) => !q || (z.props.name ?? '').toLowerCase().includes(q) || (z.props.notes ?? '').toLowerCase().includes(q))
        .sort((a, b) => (fareFor(a.props, activeClass) ?? 1e9) - (fareFor(b.props, activeClass) ?? 1e9))

    const savedAt = meta?.updatedAt
        ? new Date(meta.updatedAt).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
          })
        : null

    return (
        <div className="w-full flex-1 min-h-0 flex flex-col-reverse sm:flex-row gap-4 px-5 max-sm:px-0 pb-1">
            {/* ---------- sidebar ---------- */}
            <aside className="w-full sm:w-[340px] sm:shrink-0 flex flex-col min-h-0 max-sm:h-[70%] rounded-2xl bg-[var(--foreground-muted)] overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-[var(--background-primary)]/10">
                    <h4 className="font-semibold text-[var(--background-primary)]">{dc("Kiraya zone editor")}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mt-1">{dc("Kisi bhi area par tap karke uska rate badlein. Safed golon ko kheench kar area ki shape badlein. Map par kahin bhi tap karke dekhein wahan ka kiraya kitna banta hai.")}</p>
                </div>

                <div className="flex gap-2 px-5 py-3 border-b border-[var(--background-primary)]/10">
                    <button
                        type="button"
                        onClick={startDraw}
                        disabled={loading || !!loadError}
                        className="flex-1 rounded-xl border border-[var(--background-primary)]/20 px-3 py-2 text-sm font-semibold text-[var(--text-foreground)] cursor-pointer transition-colors duration-300 hover:bg-[var(--background-primary)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:opacity-[0.7] disabled:opacity-50 disabled:cursor-not-allowed"
                    >{dc("Naya area banayein")}</button>
                    <button
                        type="button"
                        onClick={openSave}
                        disabled={loading || !!loadError}
                        className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-[var(--foreground)] cursor-pointer transition-opacity duration-300 hover:opacity-[0.9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:opacity-[0.7] disabled:opacity-50 disabled:cursor-not-allowed"
                    >{dc("Save karke live karein")}</button>
                </div>

                {/* All four customer prices remain inspectable, even though only
                    the Wagon R source fare is editable. */}
                <div className="flex px-5 py-3 border-b border-[var(--background-primary)]/10">
                    {CLASSES.map((c, i) => (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => setActiveClass(c.key)}
                            className={`flex-1 border border-[var(--background-primary)]/20 px-1 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${i === 0 ? 'rounded-l-lg' : ''} ${i === CLASSES.length - 1 ? 'rounded-r-lg border-l-0' : ''} ${i > 0 && i < CLASSES.length - 1 ? 'border-l-0' : ''} ${
                                c.key === activeClass
                                    ? 'bg-primary border-primary text-[var(--foreground)]'
                                    : 'text-gray-500 hover:bg-[var(--background-primary)]/5'
                            }`}
                        >
                            {c.shortLabel}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center px-5">
                        <p className="text-sm text-gray-500">{dc("Load ho raha hai…")}</p>
                    </div>
                ) : loadError ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <FailureState
                            tone="light"
                            title={dc("Rate card load nahi hua")}
                            detail={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    </div>
                ) : selected ? (
                    /* ---------- edit form ---------- */
                    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-1">
                        <label className={labelCls} htmlFor="f-name">{dc("Area ka naam")}</label>
                        <input
                            id="f-name"
                            type="text"
                            autoComplete="off"
                            className={field}
                            value={selected.props.name ?? ''}
                            onChange={(e) => {
                                selected.props.name = e.target.value
                                refreshZone(selected)
                                bump()
                            }}
                        />

                        <label className={labelCls} htmlFor="f-hatchback">{dc("Wagon R base rate (₹, Shiv Nadar se one way)")}</label>
                        <input
                            id="f-hatchback"
                            type="number"
                            min="0"
                            step="50"
                            inputMode="numeric"
                            className={field}
                            value={selected.props.fares?.hatchback ?? ''}
                            onChange={(e) => onHatchback(e.target.value)}
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2" aria-label={dc("Calculated fares")}>
                            {CLASSES.map(({ key, label }) => (
                                <div key={key} className="rounded-xl bg-[var(--background-primary)]/[0.045] px-3 py-2">
                                    <div className="text-[10.5px] text-gray-500">{label}</div>
                                    <div className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text-foreground)]">
                                        {fmt(fareFor(selected.props, key))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11.5px] text-gray-500 leading-relaxed mt-2">{dc("Sirf Wagon R ka rate badlein. Website hamesha Sedan +₹100, Ertiga 1.6× aur Innova Crysta 2.75× calculate karegi; alag car rate save nahi hota.")}</p>

                        <label className={labelCls} htmlFor="f-toll">{dc("Raste mein toll (₹)")}</label>
                        <input
                            id="f-toll"
                            type="number"
                            min="0"
                            step="50"
                            inputMode="numeric"
                            className={field}
                            value={selected.props.toll ?? ''}
                            onChange={(e) => {
                                if (e.target.value === '' || +e.target.value === 0) delete selected.props.toll
                                else selected.props.toll = +e.target.value
                                bump()
                            }}
                        />
                        <p className="text-[11.5px] text-gray-500 leading-relaxed mt-2">{dc("Yeh kiraye mein jud kar customer ko dikhta hai. Toll nahi hai to khaali chhod dein.")}</p>

                        <label className={labelCls} htmlFor="f-notes">{dc("Notes (is area mein kaun kaun si jagah aati hain)")}</label>
                        <textarea
                            id="f-notes"
                            rows={3}
                            className={field}
                            value={selected.props.notes ?? ''}
                            onChange={(e) => {
                                if (e.target.value) selected.props.notes = e.target.value
                                else delete selected.props.notes
                                bump()
                            }}
                        />

                        <div className="flex gap-2 mt-5 mb-4">
                            <button
                                type="button"
                                onClick={() => select(null)}
                                className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-[var(--foreground)] cursor-pointer transition-opacity duration-300 hover:opacity-[0.9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:opacity-[0.7]"
                            >{dc("Ho gaya")}</button>
                            <button
                                type="button"
                                onClick={deleteZone}
                                className="rounded-xl border border-[var(--background-primary)]/20 px-3 py-2 text-sm font-semibold text-negative-light cursor-pointer transition-colors duration-300 hover:border-negative-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-negative-light active:opacity-[0.7]"
                            >{dc("Hata dein")}</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="px-5 pt-3">
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={dc("Jagah ka naam dhoondhein…")}
                                autoComplete="off"
                                className={field}
                            />
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto mt-2">
                            {visible.length === 0 ? (
                                <EmptyState
                                    tone="light"
                                    glyph="search"
                                    title={dc("Is naam ka koi area nahi mila")}
                                    message={dc("Spelling dekh lein, ya poora naam hatakar dobara dhoondhein.")}
                                    secondaryAction={search ? { get "label"() { return dc("Search hatayein"); }, onClick: () => setSearch('') } : undefined}
                                />
                            ) : (
                                visible.map((z, i) => (
                                    <button
                                        key={`${z.props.name}-${i}`}
                                        type="button"
                                        onClick={() => {
                                            select(z)
                                            mapRef.current.fitBounds(z.layer.getBounds(), { maxZoom: 14 })
                                        }}
                                        className="w-full flex items-center gap-2.5 px-5 py-2.5 text-left border-b border-[var(--background-primary)]/10 cursor-pointer transition-colors duration-300 hover:bg-[var(--background-primary)]/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                                    >
                                        <span
                                            className="w-3 h-3 rounded shrink-0"
                                            style={{ background: bandColor(fareFor(z.props, activeClass)) }}
                                        />
                                        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-[var(--text-foreground)]">
                                            {z.props.name}
                                            {isChanged(z) && <span className="text-primary"> •</span>}
                                        </span>
                                        <span className="text-sm text-gray-500 tabular-nums">
                                            {fmt(fareFor(z.props, activeClass))}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                )}

                <div className="px-5 py-3 border-t border-[var(--background-primary)]/10">
                    <p className="text-[11.5px] text-gray-500 leading-relaxed">{status}</p>
                    {savedAt && (
                        <p className="text-[11.5px] text-gray-400 mt-1">{dc("Aakhri baar live kiya:") + " "}{savedAt}</p>
                    )}
                </div>
            </aside>

            {/* ---------- map ---------- */}
            <main className="relative flex-1 min-h-0 max-sm:h-[30%] rounded-2xl overflow-hidden">
                <div ref={mapNodeRef} className="absolute inset-0 bg-[#e8e8e8]" />

                {/* ---------- price checker ---------- */}
                <div className="absolute right-3 top-3 z-[800] w-[234px] max-sm:w-[190px] rounded-xl border border-[var(--background-primary)]/10 bg-[var(--foreground)]/95 px-3.5 py-3 text-xs shadow-[0_4px_16px_rgba(18,18,32,0.18)]">
                    <h2 className="text-[11px] font-bold text-gray-500 mb-2">{dc("YAHAN KA KIRAYA KITNA?")}</h2>
                    {probe === null ? (
                        <p className="text-gray-500 leading-relaxed">{dc("Map par kahin bhi tap karein.")}</p>
                    ) : probe === 'none' ? (
                        <>
                            <div className="text-[13px] font-bold leading-snug text-[var(--text-foreground)]">{dc("Kisi bhi area mein nahi hai")}</div>
                            <p className="mt-2 text-[11px] leading-relaxed text-amber-600">{dc("Yahan ki ride aapke rate card se nahi, distance ke hisaab se lagegi.")}</p>
                        </>
                    ) : (
                        <>
                            <div className="text-[13px] font-bold leading-snug text-[var(--text-foreground)]">{probe.name}</div>
                            {CLASSES.map(({ key, label }) => {
                                const base = fareFor({ fares: probe.fares }, key)
                                return (
                                    <div key={key} className="flex justify-between mt-1 tabular-nums">
                                        <span className="text-gray-500">{label}</span>
                                        <span className="text-[var(--text-foreground)]">
                                            {fmt(base == null ? null : base + probe.toll)}
                                        </span>
                                    </div>
                                )
                            })}
                            {probe.toll > 0 && (
                                <p className="mt-2 text-[11px] leading-relaxed text-amber-600">{dc("Ismein") + " "}{fmt(probe.toll)}{" " + dc("ka toll shaamil hai.")}</p>
                            )}
                            {probe.blended && (
                                <p className="mt-2 text-[11px] leading-relaxed text-amber-600">{dc("Yeh jagah") + " "}<strong>{probe.pair[0]}</strong>{" " + dc("aur") + " "}<strong>{probe.pair[1]}</strong>{" " + dc("dono mein aati hai, isliye rate dono ka average liya gaya hai. Agar aisa nahi chahiye to kisi ek ki boundary hata dein.")}</p>
                            )}
                        </>
                    )}
                </div>
            </main>

            {/* ---------- save summary ---------- */}
            {modal && (
                <div
                    className="fixed inset-0 z-[1200] flex items-center justify-center bg-[rgba(6,6,12,0.72)] p-6"
                    onClick={() => !saving && setModal(null)}
                >
                    <div
                        className="flex w-full max-w-[460px] max-h-[80vh] flex-col rounded-2xl bg-[var(--foreground)] p-5 shadow-[0_18px_48px_rgba(6,6,12,0.35)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-base font-semibold text-[var(--background-primary)]">
                            {modal.changes.length ? dc("{{value0}} badlaav live karein", {value0: (modal.changes.length)}) : dc("Abhi tak kuch nahi badla")}
                        </h2>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{dc("List ek baar dekh lein. Save karte hi website par yeh rates chalu ho jaayenge — har nayi ride inhi par lagegi.")}</p>

                        <ul className="my-3.5 flex-1 overflow-y-auto text-[12.5px] leading-relaxed">
                            {modal.changes.length === 0 && (
                                <li className="border-b border-[var(--background-primary)]/10 py-1.5 text-gray-500">{dc("Kisi area mein koi badlaav nahi hua, isliye save karne ko kuch nahi hai.")}</li>
                            )}
                            {modal.changes.map((c, i) => (
                                <li key={i} className="border-b border-[var(--background-primary)]/10 py-1.5 text-[var(--text-foreground)]">
                                    <span
                                        className={`mr-1.5 font-bold ${
                                            c.kind === 'add' ? 'text-green-600' : c.kind === 'del' ? 'text-negative-light' : 'text-primary'
                                        }`}
                                    >
                                        {c.kind === 'add' ? dc("NAYA") : c.kind === 'del' ? 'HATAYA' : 'BADLA'}
                                    </span>
                                    <span dangerouslySetInnerHTML={{ __html: c.text }} />
                                </li>
                            ))}
                            {modal.unpriced > 0 && (
                                <li className="border-b border-[var(--background-primary)]/10 py-1.5 text-[var(--text-foreground)]">
                                    <span className="mr-1.5 font-bold text-negative-light">{dc("DHYAN DEIN")}</span>
                                    {modal.unpriced}{" " + dc("area ka naam ya Wagon R ka rate nahi bhara hai, isliye")}{' '}
                                    {modal.unpriced > 1 ? dc("unka") : dc("uska")}{" " + dc("kiraya distance ke hisaab se lagega.")}</li>
                            )}
                        </ul>

                        {saveError && (
                            <p className="mb-3 rounded-xl bg-negative-light/10 px-3 py-2 text-[12.5px] leading-relaxed text-negative">
                                {saveError}
                            </p>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setModal(null)}
                                disabled={saving}
                                className="rounded-xl border border-[var(--background-primary)]/20 px-3 py-2 text-sm font-semibold text-[var(--text-foreground)] cursor-pointer transition-colors duration-300 hover:bg-[var(--background-primary)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:opacity-[0.7] disabled:opacity-50 disabled:cursor-not-allowed"
                            >{dc("Abhi aur badlein")}</button>
                            <button
                                type="button"
                                onClick={confirmSave}
                                disabled={saving}
                                className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-[var(--foreground)] cursor-pointer transition-opacity duration-300 hover:opacity-[0.9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:opacity-[0.7] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? dc("Live kiya ja raha hai…") : dc("Live karein")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default EditFares

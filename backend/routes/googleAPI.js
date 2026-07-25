import { Router } from 'express'

const googleRouter = Router()

// Per-prefix autocomplete cache shared across all users. TTL keeps answers
// fresh; the cap bounds memory with LRU eviction (hits re-insert to the
// back). In-process, so it empties on restart.
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 500
const autocompleteCache = new Map() // key -> { data, cachedAt }

googleRouter.get('/autocomplete', async (req,res)=>{
    try{
        const input = req.query.input?.trim()

        if (!input || input.length < 3) {
            return res.status(400).json({
                error: "input must be at least 3 characters"
            })
        }

        const cacheKey = input.toLowerCase()
        const hit = autocompleteCache.get(cacheKey)
        if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
            autocompleteCache.delete(cacheKey) // re-insert = mark recently used
            autocompleteCache.set(cacheKey, hit)
            return res.json(hit.data)
        }

        const response = await fetch(
            "https://places.googleapis.com/v1/places:autocomplete",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
                },
                body: JSON.stringify({
                    input,
                    regionCode: "IN",
                }),
            }
        )

        const data = await response.json()

        if (!response.ok) {
            console.error("Places autocomplete error:", data.error?.message)
            return res.status(response.status).json({
                error: "Autocomplete failed"
            })
        }

        if (autocompleteCache.size >= CACHE_MAX_ENTRIES) {
            autocompleteCache.delete(autocompleteCache.keys().next().value)
        }
        autocompleteCache.set(cacheKey, { data, cachedAt: Date.now() })

        res.json(data)
    } catch(err) {
        res.status(500).json({
            message: "Failed to fetch autocomplete results"
        })
    }
})

// placeId -> coordinates for the booking payload. Details rarely change, so 24h TTL.
const DETAILS_TTL_MS = 24 * 60 * 60 * 1000
const detailsCache = new Map() // placeId -> { data, cachedAt }

googleRouter.get('/details/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params

        const hit = detailsCache.get(placeId)
        if (hit && Date.now() - hit.cachedAt < DETAILS_TTL_MS) {
            return res.json(hit.data)
        }

        const response = await fetch(
            `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
            {
                headers: {
                    "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
                    "X-Goog-FieldMask": "location,formattedAddress",
                },
            }
        )

        const data = await response.json()

        if (!response.ok) {
            console.error("Place details error:", data.error?.message)
            return res.status(response.status).json({
                error: "Place details failed"
            })
        }

        const result = {
            lat: data.location?.latitude ?? null,
            lng: data.location?.longitude ?? null,
            formattedAddress: data.formattedAddress ?? null,
        }

        if (detailsCache.size >= CACHE_MAX_ENTRIES) {
            detailsCache.delete(detailsCache.keys().next().value)
        }
        detailsCache.set(placeId, { data: result, cachedAt: Date.now() })

        res.json(result)
    } catch (err) {
        res.status(500).json({
            message: "Failed to fetch place details"
        })
    }
})

// lat/lng -> human-readable address for the confirm-pin screen. Addresses
// don't move, so same 24h TTL as details; keys snap to a ~1m grid so
// jitter-level re-settles at the same spot hit the cache.
const geocodeCache = new Map() // "lat,lng" -> { data, cachedAt }

googleRouter.get('/reverse-geocode', async (req, res) => {
    try {
        const lat = Number(req.query.lat)
        const lng = Number(req.query.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
            Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            return res.status(400).json({
                error: "lat and lng must be valid coordinates"
            })
        }

        const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`
        const hit = geocodeCache.get(cacheKey)
        if (hit && Date.now() - hit.cachedAt < DETAILS_TTL_MS) {
            return res.json(hit.data)
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&region=in&key=${process.env.GOOGLE_MAPS_API_KEY}`
        )

        const data = await response.json()

        // Geocoding API signals errors in body.status, not the HTTP code.
        if (!response.ok || (data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
            console.error("Reverse geocode error:", data.error_message ?? data.status)
            return res.status(502).json({
                error: "Reverse geocode failed"
            })
        }

        // The nearest match can be a plus code ("XW2M+X8 Sitamarhi") — skip
        // to the first real address; formattedAddress is null on ZERO_RESULTS.
        const best = (data.results ?? []).find(r => !r.types?.includes("plus_code"))
            ?? data.results?.[0]
        const result = { formattedAddress: best?.formatted_address ?? null }

        if (geocodeCache.size >= CACHE_MAX_ENTRIES) {
            geocodeCache.delete(geocodeCache.keys().next().value)
        }
        geocodeCache.set(cacheKey, { data: result, cachedAt: Date.now() })

        res.json(result)
    } catch (err) {
        res.status(500).json({
            message: "Failed to reverse geocode"
        })
    }
})

export default googleRouter

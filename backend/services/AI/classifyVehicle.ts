import { VehicleClass } from "@prisma/client";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { openai } from "../../lib/openai.js";

export const PREMIUM_PRICE = 1_700_000;
export const PREMIUM_MIN_SEATS = 7;
const MIN_CONFIDENCE = 0.75;
const NORMAL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PRICE_SENSITIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1_000;

const bodyTypeSchema = z.enum([
    "hatchback",
    "sedan",
    "compact_sedan",
    "suv",
    "mpv",
    "crossover",
    "other",
    "unknown",
]);

const initialVehicleDetailsSchema = z.object({
    normalizedModel: z.string().trim().min(1).nullable(),
    bodyType: bodyTypeSchema.nullable(),
    // Total advertised seating capacity, including the driver (for example, XUV700 = 7).
    seats: z.number().int().positive().nullable(),
    confidence: z.number().min(0).max(1),
});

const vehicleDetailsSchema = initialVehicleDetailsSchema.extend({
    // Only needed for 7+ seat SUV-like vehicles. Never on-road or used-car price.
    basePrice: z.number().int().nonnegative().nullable(),
});

export type VehicleDetails = z.infer<typeof vehicleDetailsSchema>;
type InitialVehicleDetails = z.infer<typeof initialVehicleDetailsSchema>;

export interface VehicleClassification extends VehicleDetails {
    vehicleClass: VehicleClass | null;
    // Alias requested by the classifier contract. The value is the RCS vehicle class.
    category: VehicleClass | null;
    needsLookup: boolean;
    webLookupUsed: boolean;
    cacheHit: boolean;
}

type CacheEntry = {
    result: VehicleClassification;
    expiresAt: number;
};

const vehicleClassificationCache = new Map<string, CacheEntry>();
const inFlightClassifications = new Map<string, Promise<VehicleClassification>>();

const isSuvIsh = (bodyType: InitialVehicleDetails["bodyType"]) =>
    bodyType === "suv" || bodyType === "mpv" || bodyType === "crossover";

export function normalizeVehicleCacheKey(input: string) {
    return input
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "");
}

export function shouldUseWebLookup(vehicle: InitialVehicleDetails) {
    if (
        vehicle.confidence < MIN_CONFIDENCE ||
        vehicle.normalizedModel === null ||
        vehicle.bodyType === null ||
        vehicle.bodyType === "unknown"
    ) {
        return true;
    }

    if (!isSuvIsh(vehicle.bodyType)) return false;
    return vehicle.seats === null || vehicle.seats >= PREMIUM_MIN_SEATS;
}

export function classifyVehicleDetails(vehicle: VehicleDetails): VehicleClass | null {
    // If identity/specification confidence is still poor after lookup, do not guess a class.
    if (vehicle.confidence < MIN_CONFIDENCE) return null;

    if (vehicle.bodyType === "hatchback") return VehicleClass.hatchback;

    if (vehicle.bodyType === "sedan" || vehicle.bodyType === "compact_sedan") {
        return VehicleClass.sedan;
    }

    if (!isSuvIsh(vehicle.bodyType)) return null;

    // Seat count is decisive for whether this SUV-like vehicle can ever be premium.
    if (vehicle.seats === null) return null;
    if (vehicle.seats < PREMIUM_MIN_SEATS) return VehicleClass.suv;

    // For a 7+ seater, price is also decisive. Missing price must not silently become `suv`.
    if (vehicle.basePrice === null) return null;

    return vehicle.basePrice > PREMIUM_PRICE
        ? VehicleClass.suv_premium
        : VehicleClass.suv;
}

const INITIAL_INSTRUCTIONS = `
You identify vehicles for an Indian cab service. The user supplies a vehicle model name that may
be misspelled, incomplete, abbreviated, old, or recently released. Do not match against or assume
a predefined vehicle list. Identify the vehicle from your knowledge and return only the facts needed
for classification.

Return:
- normalizedModel: the manufacturer and model in a concise canonical form
- bodyType
- seats: the manufacturer's advertised TOTAL seating capacity INCLUDING the driver
- confidence from 0 to 1 for the vehicle identity and these specifications

Do not look up or estimate price. Correct obvious spelling mistakes. If a fact is uncertain, return
null for that fact rather than inventing it. Do not decide the RCS vehicle class; TypeScript applies
the business rules.
`.trim();

const LOOKUP_INSTRUCTIONS = `
You identify vehicles for an Indian cab service. You MUST use web search before answering because
the vehicle identity or a classification-critical specification needs verification.

Verify the most likely vehicle from the user's text and return:
- normalizedModel: the manufacturer and model in a concise canonical form
- bodyType
- seats: the manufacturer's advertised TOTAL seating capacity INCLUDING the driver
- basePrice: ONLY when the verified vehicle is SUV/MPV/crossover-like with 7+ total seats, return
  the current cheapest/base variant Indian EX-SHOWROOM new-vehicle price in INR; otherwise null
- confidence from 0 to 1 for the verified identity/specifications

Prefer the manufacturer's current Indian site. If it does not provide a needed fact, use a reputable
current Indian automotive source. Never use on-road price, used-car price, or top-variant price. For
a discontinued model whose price is classification-critical, use the most recent base-variant Indian
ex-showroom price from when it was sold new. If a required fact cannot be verified, return null for
that fact and lower confidence. Do not decide the RCS vehicle class; TypeScript applies the rules.
`.trim();

async function parseInitialVehicleDetails(messages: string): Promise<InitialVehicleDetails> {
    const response = await openai.responses.parse({
        model: "gpt-5.6-luna",
        reasoning: { effort: "none" },
        instructions: INITIAL_INSTRUCTIONS,
        input: messages,
        text: {
            format: zodTextFormat(initialVehicleDetailsSchema, "vehicle_identity"),
        },
    });

    if (response.output_parsed === null) {
        throw new Error("Vehicle classification response did not contain parsed vehicle details.");
    }

    return response.output_parsed;
}

async function parseVerifiedVehicleDetails(messages: string): Promise<VehicleDetails> {
    const response = await openai.responses.parse({
        model: "gpt-5.6-luna",
        reasoning: { effort: "none" },
        instructions: LOOKUP_INSTRUCTIONS,
        input: messages,
        tools: [{
            type: "web_search" as const,
            external_web_access: true,
            search_context_size: "medium" as const,
        }],
        // The lookup request exposes only web search, so required guarantees a real lookup.
        tool_choice: "required" as const,
        text: {
            format: zodTextFormat(vehicleDetailsSchema, "verified_vehicle_details"),
        },
    });

    if (response.output_parsed === null) {
        throw new Error("Vehicle lookup response did not contain parsed vehicle details.");
    }

    return response.output_parsed;
}

const hasUnresolvedClassificationFacts = (vehicle: VehicleDetails) => {
    if (
        vehicle.confidence < MIN_CONFIDENCE ||
        vehicle.normalizedModel === null ||
        vehicle.bodyType === null ||
        vehicle.bodyType === "unknown"
    ) {
        return true;
    }

    if (!isSuvIsh(vehicle.bodyType)) return false;
    if (vehicle.seats === null) return true;
    return vehicle.seats >= PREMIUM_MIN_SEATS && vehicle.basePrice === null;
};

const cacheTtlMs = (result: VehicleClassification) =>
    isSuvIsh(result.bodyType) &&
    result.seats !== null &&
    result.seats >= PREMIUM_MIN_SEATS
        ? PRICE_SENSITIVE_CACHE_TTL_MS
        : NORMAL_CACHE_TTL_MS;

const readCache = (key: string): VehicleClassification | null => {
    if (!key) return null;
    const entry = vehicleClassificationCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        vehicleClassificationCache.delete(key);
        return null;
    }

    vehicleClassificationCache.delete(key);
    vehicleClassificationCache.set(key, entry);
    return { ...entry.result, webLookupUsed: false, cacheHit: true };
};

const writeCache = (key: string, result: VehicleClassification) => {
    if (!key || result.vehicleClass === null || result.needsLookup) return;

    vehicleClassificationCache.delete(key);
    while (vehicleClassificationCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = vehicleClassificationCache.keys().next().value;
        if (oldestKey === undefined) break;
        vehicleClassificationCache.delete(oldestKey);
    }

    vehicleClassificationCache.set(key, {
        result: { ...result, cacheHit: false },
        expiresAt: Date.now() + cacheTtlMs(result),
    });
};

async function classifyVehicleUncached(messages: string): Promise<VehicleClassification> {
    const initialVehicle = await parseInitialVehicleDetails(messages);
    const webLookupUsed = shouldUseWebLookup(initialVehicle);
    const vehicle: VehicleDetails = webLookupUsed
        ? await parseVerifiedVehicleDetails(messages)
        : { ...initialVehicle, basePrice: null };
    const vehicleClass = classifyVehicleDetails(vehicle);

    return {
        ...vehicle,
        vehicleClass,
        category: vehicleClass,
        needsLookup: hasUnresolvedClassificationFacts(vehicle) || vehicleClass === null,
        webLookupUsed,
        cacheHit: false,
    };
}

export async function classifyVehicle(messages: string): Promise<VehicleClassification> {
    const cacheKey = normalizeVehicleCacheKey(messages);
    const cached = readCache(cacheKey);
    if (cached) return cached;

    const pending = cacheKey ? inFlightClassifications.get(cacheKey) : undefined;
    if (pending) return pending;

    const classification = classifyVehicleUncached(messages);
    if (cacheKey) inFlightClassifications.set(cacheKey, classification);

    try {
        const result = await classification;
        writeCache(cacheKey, result);
        return result;
    } finally {
        if (cacheKey) inFlightClassifications.delete(cacheKey);
    }
}

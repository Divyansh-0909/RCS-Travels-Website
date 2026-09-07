import { VehicleClass } from "@prisma/client";
import { openai } from "../../lib/openai.js";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const BookingRequestScehma = z.object({
    pickup: z.string().nullable(),
    drop: z.string().nullable(),
    vehicleClass: z.enum(VehicleClass).nullable(),
    scheduledAt: z.string().datetime().nullable(),
    scheduledAtText: z.string().nullable(),
    preferSafeRoute: z.boolean().nullable(),
    needsCarrier: z.boolean().nullable(),
    sharing: z.boolean().nullable(),
    passengers: z.number().int().positive().nullable(),
})

export async function parseBookingMessage(messages: string, model: string) {
    const response = await openai.responses.parse({
        model: model,
        instructions: "Extract cab booking information from the user's message. Do not invent information that the user did not provide. Locations and should be preserved as the user described them. If a field is unknown, return null.",
        input: messages,
        text: {
            format: zodTextFormat(BookingRequestScehma,"booking_request")
        }
    })

    return response.output_parsed;
}

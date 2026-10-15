import { VehicleClass } from "@prisma/client";
import { openai } from "../../lib/openai.js";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {TypeSafeClient, choice, noul, score} from "@typesafe-ai/sdk";

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

const client = new TypeSafeClient();

export async function analyzeRideQuery(userInput: string) {
  const { answers } = await client.systemOne({
    state: userInput,

    questions: {
      queryType: choice(
        "Is this just a location search, or is this a ride request?",
        {
          "location-search": "The user entered only the name of a location.",
          "ride-request":
            "The user is describing a ride they want, such as where they want to go, where they are coming from, or when they want the ride.",
        }
      ),

      complexity: score(
        "How difficult is it to extract the ride details from the user's request?",
        [
          "Simple: the ride details are stated clearly and directly.",
          "Complex: the ride details are ambiguous, indirect, incomplete, or difficult to extract.",
        ]
      ),

      isUrgent: noul(
        "Does the user want this ride right now?"
      ),
    },
  });

  return answers;
}

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

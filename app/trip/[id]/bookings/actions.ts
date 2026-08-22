"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";

const StaysSchema = z.object({
  stays: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["homestay", "cabin", "hotel", "resort", "hostel"]),
        area: z.string().describe("neighbourhood or locality"),
        estPerNight: z.number().describe("estimated whole-party price per night, local currency"),
        whyFit: z
          .string()
          .describe("one line citing the party or budget — never generic praise"),
      }),
    )
    .min(2)
    .max(8),
});

const STAYS_SYSTEM = `You suggest real, well-known places to stay at a
destination. Rules:
- Only properties that actually exist and are findable by name on booking
  sites. Never invent one.
- estPerNight is for the WHOLE party (they will verify the live price on the
  booking site — be conservative).
- whyFit must cite the party or the budget ("ground-floor rooms for a knee
  that hates stairs", "two family rooms under the budget") — generic praise
  is forbidden.
- Respect the requested stay types when given; otherwise mix sensibly.`;

export type StayResult = {
  name: string;
  type: string;
  area: string;
  estPerNight: number;
  whyFit: string;
};

export async function suggestStaysAction(
  tripId: string,
  stayTypes: string[],
): Promise<
  | { ok: true; stays: StayResult[] }
  | { ok: false; reason: "no-key" | "failed" }
> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return { ok: false, reason: "failed" };

  try {
    const res = await askAI({
      feature: "suggestStays",
      system: STAYS_SYSTEM,
      prompt: JSON.stringify({
        destination: trip.destination,
        party: trip.party,
        stayTypes: stayTypes.length ? stayTypes : ["any"],
        nights: Math.round(
          (trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000,
        ),
        currency: trip.currency,
      }),
      schema: StaysSchema,
      cache: true,
      timeoutMs: 45_000,
    });
    return { ok: true, stays: res.stays };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("suggestStays failed:", e);
    return { ok: false, reason: "failed" };
  }
}

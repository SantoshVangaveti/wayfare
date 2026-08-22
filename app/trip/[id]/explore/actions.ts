"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import { getCurrentUser } from "@/lib/session";
import { tripBudget } from "@/lib/budget";
import type { OpenHours } from "@/lib/types";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const PlacesSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string(),
        category: z.enum(["activity", "restaurant"]),
        description: z.string().describe("one line, concrete: what you actually do there"),
        lat: z.number(),
        lng: z.number(),
        durationMin: z.number(),
        priceLevel: z.number().min(1).max(4).optional(),
        rating: z.number().min(0).max(5).optional(),
        tags: z
          .array(z.string())
          .describe(
            "from: outdoor indoor flat strenuous kid-friendly veg nonveg scenic shopping early plus any allergen present (nuts, shellfish)",
          ),
        open: z.string().optional().describe("HH:MM opening time, null if always open"),
        close: z.string().optional(),
        closedDays: z.array(z.enum(DAY_KEYS)).optional(),
      }),
    )
    .min(14)
    .max(26),
});

const PLACES_SYSTEM = `You suggest real, well-known places at a destination:
about 12 activities and 10 restaurants. Rules:
- Real places with real coordinates. Never invent one.
- Honest durations door-to-door at the site (a viewpoint is 45-60 min, a trek
  is 4-6 h). Honest opening hours; closedDays for weekly closures.
- Tag accurately: "strenuous" for climbs and long treks, "flat" when a person
  with limited mobility manages easily, "kid-friendly", "veg"/"nonveg" for
  restaurants, and any allergen a restaurant is known for (e.g. "nuts").
- Respect the party you are given — include enough gentle options for seniors
  and enough fun for kids, but do not exclude ambitious options; tag them.`;

export type PlacesResult =
  | { ok: true }
  | { ok: false; reason: "no-key" | "failed" };

export async function suggestPlacesAction(tripId: string): Promise<PlacesResult> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { candidates: { select: { id: true } } },
  });
  if (!trip) return { ok: false, reason: "failed" };
  if (trip.candidates.length > 0) return { ok: true };

  const budget = await tripBudget(tripId);

  try {
    const res = await askAI({
      feature: "suggestPlaces",
      system: `${PLACES_SYSTEM}\n- ${budget.brief}`,
      prompt: JSON.stringify({
        destination: trip.destination,
        lat: trip.destLat,
        lng: trip.destLng,
        party: trip.party,
        budgetPerDay: budget.perDay,
        currency: budget.currency,
        dates: {
          start: trip.startDate.toISOString().slice(0, 10),
          end: trip.endDate.toISOString().slice(0, 10),
        },
      }),
      schema: PlacesSchema,
      cache: true,
      timeoutMs: 45_000,
    });

    await prisma.candidate.createMany({
      data: res.candidates.map((c) => {
        let openHours: OpenHours | undefined;
        if (c.open && c.close) {
          openHours = {};
          for (const d of DAY_KEYS) {
            if (!c.closedDays?.includes(d)) openHours[d] = [c.open, c.close];
          }
        }
        return {
          tripId,
          name: c.name,
          category: c.category,
          description: c.description,
          lat: c.lat,
          lng: c.lng,
          durationMin: Math.round(c.durationMin),
          priceLevel: c.priceLevel ?? undefined,
          rating: c.rating ?? undefined,
          tags: c.tags,
          openHours: openHours as object | undefined,
        };
      }),
    });
    revalidatePath(`/trip/${tripId}/explore`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("suggestPlaces failed:", e);
    return { ok: false, reason: "failed" };
  }
}

export async function toggleVote(tripId: string, candidateId: string) {
  const [user, cand] = await Promise.all([
    getCurrentUser(),
    prisma.candidate.findUnique({ where: { id: candidateId } }),
  ]);
  if (!user || !cand || cand.tripId !== tripId) return;
  const votes = cand.votes.includes(user.id)
    ? cand.votes.filter((v) => v !== user.id)
    : [...cand.votes, user.id];
  await prisma.candidate.update({ where: { id: candidateId }, data: { votes } });
  revalidatePath(`/trip/${tripId}/explore`);
}

export async function addCandidateToDay(
  tripId: string,
  candidateId: string,
  date: string,
) {
  const cand = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!cand || cand.tripId !== tripId) return;
  const maxSort = await prisma.block.aggregate({
    where: { tripId },
    _max: { sortOrder: true },
  });
  await prisma.$transaction([
    prisma.block.create({
      data: {
        tripId,
        date: new Date(`${date}T00:00:00.000Z`),
        startTime: cand.category === "restaurant" ? "13:00" : "10:00",
        type: cand.category === "restaurant" ? "MEAL" : "ACTIVITY",
        title: cand.name,
        subtitle: cand.description,
        placeName: cand.name,
        lat: cand.lat,
        lng: cand.lng,
        durationMin: cand.durationMin,
        tags: cand.tags,
        openHours: cand.openHours ?? undefined,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    }),
    prisma.candidate.update({
      where: { id: candidateId },
      data: { scheduled: true },
    }),
  ]);
  revalidatePath(`/trip/${tripId}`, "layout");
}

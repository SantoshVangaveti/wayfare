"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import { getCurrentUser } from "@/lib/session";
import { tripBudget } from "@/lib/budget";
import { haversineKm } from "@/lib/feasibility";
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

type PlaceSuggestion = z.infer<typeof PlacesSchema>["candidates"][number];

/** open/close/closedDays → the OpenHours shape the engine reads. */
function openHoursOf(c: PlaceSuggestion): OpenHours | undefined {
  if (!c.open || !c.close) return undefined;
  const openHours: OpenHours = {};
  for (const d of DAY_KEYS) {
    if (!c.closedDays?.includes(d)) openHours[d] = [c.open, c.close];
  }
  return openHours;
}

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
      data: res.candidates.map((c) => ({
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
        openHours: openHoursOf(c) as object | undefined,
      })),
    });
    revalidatePath(`/trip/${tripId}/explore`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("suggestPlaces failed:", e);
    return { ok: false, reason: "failed" };
  }
}

/** How far from a stop a candidate can sit and still count as "there". */
const LEG_RADIUS_KM = 60;
/** Below this many nearby candidates, a stop has nothing to plan a day from. */
const LEG_MIN_CANDIDATES = 8;

/**
 * The per-leg twin of suggestPlacesAction. Candidates stay trip-level (they
 * have no legId — the schema is frozen), so a stop "has places" when enough
 * of them sit within LEG_RADIUS_KM of it. Single-destination trips never
 * reach this function: they have no legs.
 */
export async function suggestPlacesForLegAction(
  tripId: string,
  legId: string,
): Promise<PlacesResult> {
  const leg = await prisma.leg.findUnique({ where: { id: legId } });
  if (!leg || leg.tripId !== tripId) return { ok: false, reason: "failed" };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { candidates: true },
  });
  if (!trip) return { ok: false, reason: "failed" };

  const near = trip.candidates.filter(
    (c) =>
      c.lat != null &&
      c.lng != null &&
      haversineKm({ lat: c.lat, lng: c.lng }, { lat: leg.lat, lng: leg.lng }) <=
        LEG_RADIUS_KM,
  );
  if (near.length >= LEG_MIN_CANDIDATES) return { ok: true };

  const budget = await tripBudget(tripId);
  const seen = new Set(trip.candidates.map((c) => c.name.toLowerCase()));

  try {
    const res = await askAI({
      feature: "suggestPlaces",
      system: `${PLACES_SYSTEM}\n- ${budget.brief}`,
      prompt: JSON.stringify({
        destination: leg.destination,
        lat: leg.lat,
        lng: leg.lng,
        note: `This is one stop on a multi-stop trip. Every place must be within about ${LEG_RADIUS_KM} km of these coordinates — not at the trip's other stops.`,
        party: trip.party,
        budgetPerDay: budget.perDay,
        currency: budget.currency,
        dates: {
          start: leg.startDate.toISOString().slice(0, 10),
          end: leg.endDate.toISOString().slice(0, 10),
        },
      }),
      schema: PlacesSchema,
      cache: true,
      timeoutMs: 45_000,
    });

    const fresh = res.candidates.filter((c) => !seen.has(c.name.toLowerCase()));
    if (fresh.length) {
      await prisma.candidate.createMany({
        data: fresh.map((c) => ({
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
          openHours: openHoursOf(c) as object | undefined,
        })),
      });
    }
    revalidatePath(`/trip/${tripId}/explore`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("suggestPlaces for leg failed:", e);
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

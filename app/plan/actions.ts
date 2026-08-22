"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import { suggestPlacesAction } from "@/app/trip/[id]/explore/actions";
import { weatherFor, type Verdict } from "@/lib/weather";
import { getCurrentUser } from "@/lib/session";
import type { FunnelState } from "@/lib/funnel";

const DestSchema = z.object({
  destinations: z
    .array(
      z.object({
        name: z.string(),
        country: z.string(),
        lat: z.number(),
        lng: z.number(),
        why: z
          .string()
          .describe(
            "exactly 3 short lines separated by newlines; every line must cite something the traveller actually said, or a hard fact (drive time, altitude, step count, cost)",
          ),
        estCostPerDay: z.number().describe("per day for the whole party, in the traveller's currency"),
        matchScore: z.number().min(0).max(100),
      }),
    )
    .min(3)
    .max(6),
});

const DEST_SYSTEM = `You suggest travel destinations. You receive a traveller
profile (interests, free text, who is travelling, dates, transport, budget,
scope, starting point). Return 5 destinations, best match first.

HARD RULES:
- Generic praise is FORBIDDEN. Never write "vibrant culture", "breathtaking
  scenery", "something for everyone", "hidden gem", or anything like them.
  Every line of "why" must reference something the traveller told you (quote
  their own concern back to them) or a verifiable hard fact: drive time from
  their city, altitude, number of steps, typical September rainfall, cost.
- Scope is a constraint you apply while choosing, not a filter afterwards:
  "domestic" means inside the traveller's home country; "international" means
  outside it; "either" means a mix.
- Respect the party: a 68-year-old with a bad knee rules out trek-only places;
  kids rule out 12-hour transfers. Say so in the why.
- estCostPerDay is for the WHOLE party. matchScore reflects fit, honestly.`;

export type DestinationResult = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  why: string;
  estCostPerDay: number;
  matchScore: number;
  weather?: { summary: string; verdict: Verdict } | null;
};

export type SuggestResult =
  | { ok: true; destinations: DestinationResult[] }
  | { ok: false; reason: "no-key" | "failed" };

export async function suggestDestinationsAction(
  profile: FunnelState,
): Promise<SuggestResult> {
  try {
    const res = await askAI({
      feature: "suggestDestinations",
      system: DEST_SYSTEM,
      prompt: JSON.stringify({
        interests: profile.interests,
        freeText: profile.freeText,
        scope: profile.scope,
        home: profile.home,
        homeCountry: profile.home?.countryCode ?? "IN",
        dates: { start: profile.startDate, end: profile.endDate },
        transport: profile.transport,
        budgetPerDay: profile.budgetPerDay,
        diet: profile.diet,
        allergies: profile.allergies,
        party: profile.party,
        currency: "INR",
      }),
      schema: DestSchema,
      cache: true,
      timeoutMs: 30_000,
    });

    const top5 = res.destinations
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    // Weather verdicts are enrichment — a failed fetch just drops the chip.
    const weather = await Promise.allSettled(
      top5.map((d) => weatherFor(d.lat, d.lng, profile.startDate, profile.endDate)),
    );

    return {
      ok: true,
      destinations: top5.map((d, i) => ({
        ...d,
        weather:
          weather[i].status === "fulfilled"
            ? { summary: weather[i].value.summary, verdict: weather[i].value.verdict }
            : null,
      })),
    };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("suggestDestinations failed:", e);
    return { ok: false, reason: "failed" };
  }
}

const COVERS: Record<string, string> = {
  mountains: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=70",
  beaches: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=70",
  city: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=70",
  nature: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200&q=70",
  food: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=70",
  heritage: "https://images.unsplash.com/photo-1548013146-72479768bada?w=1200&q=70",
};

const rand = (n: number) =>
  Array.from({ length: n }, () =>
    "abcdefghjkmnpqrstuvwxyz23456789".charAt(Math.floor(Math.random() * 31)),
  ).join("");

export async function createTripFromDestination(
  profile: FunnelState,
  dest: DestinationResult,
) {
  const user = await getCurrentUser();
  const domestic = (profile.home?.countryCode ?? "IN") === dest.country || profile.scope === "domestic";

  const trip = await prisma.trip.create({
    data: {
      title: dest.name,
      destination: `${dest.name}, ${dest.country}`,
      destLat: dest.lat,
      destLng: dest.lng,
      destCountry: dest.country,
      scope: domestic ? "domestic" : "international",
      homeCountry: profile.home?.countryCode ?? "IN",
      currency: "INR",
      homeCurrency: "INR",
      startDate: new Date(`${profile.startDate}T00:00:00.000Z`),
      endDate: new Date(`${profile.endDate}T00:00:00.000Z`),
      coverImage: COVERS[profile.interests[0]] ?? COVERS.mountains,
      status: "PLANNING",
      origin: "planned",
      party: { travellers: JSON.parse(JSON.stringify(profile.party)) },
      inboundAddress: `trip-${rand(4)}@in.wayfare.app`,
      shareId: rand(17),
      members: user ? { create: { userId: user.id, role: "owner" } } : undefined,
    },
  });

  // Warm Explore while the user is still reading the Overview: the places
  // call is the slow one, and by the time they open the tab the Candidate
  // rows are already in the database. after() keeps it alive past the
  // response, and a failure here costs nothing — the screen still fetches.
  after(async () => {
    await suggestPlacesAction(trip.id).catch(() => {});
  });

  redirect(`/trip/${trip.id}`);
}

export async function createImportedTrip(input: {
  title: string;
  startDate: string;
  endDate: string;
}) {
  const user = await getCurrentUser();
  const trip = await prisma.trip.create({
    data: {
      title: input.title,
      destination: input.title,
      destLat: 0,
      destLng: 0,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      status: "PLANNING",
      origin: "imported",
      inboundAddress: `trip-${rand(4)}@in.wayfare.app`,
      shareId: rand(17),
      members: user ? { create: { userId: user.id, role: "owner" } } : undefined,
    },
  });
  redirect(`/trip/${trip.id}/inbox`);
}

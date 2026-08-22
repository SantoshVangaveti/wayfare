"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import {
  suggestPlacesAction, suggestPlacesForLegAction,
} from "@/app/trip/[id]/explore/actions";
import { weatherFor, type Verdict, type WeatherRead } from "@/lib/weather";
import { getCurrentUser } from "@/lib/session";
import { datesBetween, distributeLegDates, shortPlace } from "@/lib/legs";
import type { FunnelState } from "@/lib/funnel";
import type { Traveller } from "@/lib/types";

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

const RouteSchema = z.object({
  routes: z
    .array(
      z.object({
        title: z.string().describe("the route in three or four words, e.g. 'Coast to hills'"),
        stops: z
          .array(
            z.object({
              name: z.string(),
              country: z.string(),
              lat: z.number(),
              lng: z.number(),
              nights: z.number().describe("days spent at this stop; all stops must sum to the trip length"),
              why: z
                .string()
                .describe(
                  "exactly 2 short lines separated by newlines; every line must cite something the traveller actually said, or a hard fact (drive time from the previous stop, altitude, step count, cost)",
                ),
            }),
          )
          .min(2)
          .max(4),
        estCostPerDay: z.number().describe("per day for the whole party, in the traveller's currency"),
        matchScore: z.number().min(0).max(100),
      }),
    )
    .min(3)
    .max(4),
});

const ROUTE_SYSTEM = `You design multi-stop travel ROUTES. You receive a traveller
profile (interests, free text, who is travelling, dates, transport, budget, scope,
starting point) and the number of days. Return 3 routes, best match first. Each
route is an ORDERED list of 2-4 stops the traveller moves through in sequence.

HARD RULES:
- Generic praise is FORBIDDEN. Never write "vibrant culture", "breathtaking
  scenery", "something for everyone", "hidden gem", or anything like them.
  Every line of "why" must reference something the traveller told you (quote
  their own concern back to them) or a verifiable hard fact: drive time from
  the previous stop, altitude, number of steps, cost.
- The route must be geographically sensible in the order given: consecutive
  stops are a half-day journey apart at most, and the first stop is the
  sensible arrival gateway from their starting point. Never zig-zag.
- Pace it naturally: roughly one stop per 3-5 days. A 5-day trip is 2 stops;
  a 9-day trip is usually 3. You decide — but a stop shorter than 2 days is
  a day spent in a car, so justify it or drop it.
- nights across the stops must add up to the trip length exactly.
- Scope is a constraint you apply while choosing, not a filter afterwards:
  "domestic" means inside the traveller's home country; "international" means
  outside it; "either" means a mix.
- Respect the party: a 68-year-old with a bad knee rules out trek-only stops;
  kids rule out 12-hour transfers between stops. Say so in the why.
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

export type RouteStop = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  /** days at this stop, already reconciled against the trip's date range */
  nights: number;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  why: string;
  weather?: { summary: string; verdict: Verdict } | null;
};

export type RouteResult = {
  title: string;
  stops: RouteStop[];
  estCostPerDay: number;
  matchScore: number;
};

export type SuggestResult =
  | { ok: true; mode: "single"; destinations: DestinationResult[] }
  | { ok: true; mode: "route"; routes: RouteResult[] }
  | { ok: false; reason: "no-key" | "failed" };

export async function suggestDestinationsAction(
  profile: FunnelState,
): Promise<SuggestResult> {
  if (profile.multiCity) return suggestRoutes(profile);
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
      mode: "single",
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

/** The multi-city branch. Only ever reached when profile.multiCity is true. */
async function suggestRoutes(profile: FunnelState): Promise<SuggestResult> {
  const days = datesBetween(profile.startDate, profile.endDate).length;
  try {
    const res = await askAI({
      feature: "suggestRoutes",
      system: ROUTE_SYSTEM,
      prompt: JSON.stringify({
        interests: profile.interests,
        freeText: profile.freeText,
        scope: profile.scope,
        home: profile.home,
        homeCountry: profile.home?.countryCode ?? "IN",
        dates: { start: profile.startDate, end: profile.endDate },
        tripDays: days,
        transport: profile.transport,
        budgetPerDay: profile.budgetPerDay,
        diet: profile.diet,
        allergies: profile.allergies,
        party: profile.party,
        currency: "INR",
      }),
      schema: RouteSchema,
      cache: true,
      timeoutMs: 40_000,
    });

    const top3 = res.routes
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);

    // Reconcile the model's pacing against the real date range FIRST, so every
    // stop's weather is read for the days the traveller is actually there.
    const withDates = top3.map((r) => {
      const spans = distributeLegDates(
        profile.startDate,
        profile.endDate,
        r.stops.map((s) => s.nights),
      );
      return {
        ...r,
        stops: r.stops.slice(0, spans.length).map((s, i) => ({ ...s, ...spans[i] })),
      };
    });

    // Weather verdicts are enrichment — a failed fetch just drops the chip.
    // Routes often share a stop, so each place+window is fetched once.
    const cache = new Map<string, Promise<WeatherRead>>();
    const readWeather = (s: { lat: number; lng: number; startDate: string; endDate: string }) => {
      const key = `${s.lat.toFixed(2)},${s.lng.toFixed(2)},${s.startDate}`;
      if (!cache.has(key)) cache.set(key, weatherFor(s.lat, s.lng, s.startDate, s.endDate));
      return cache.get(key)!;
    };
    const flat = withDates.flatMap((r) => r.stops);
    const reads = await Promise.allSettled(flat.map(readWeather));
    const weatherByStop = new Map<
      (typeof flat)[number],
      { summary: string; verdict: Verdict } | null
    >();
    flat.forEach((s, i) => {
      const r = reads[i];
      weatherByStop.set(
        s,
        r.status === "fulfilled"
          ? { summary: r.value.summary, verdict: r.value.verdict }
          : null,
      );
    });

    return {
      ok: true,
      mode: "route",
      routes: withDates.map((r) => ({
        title: r.title,
        estCostPerDay: r.estCostPerDay,
        matchScore: r.matchScore,
        stops: r.stops.map((s) => ({ ...s, weather: weatherByStop.get(s) ?? null })),
      })),
    };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("suggestRoutes failed:", e);
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

// Everything they told us has to survive the funnel, not just steer the
// destination pick: budget, diet, allergies, transport and the free text
// are read later by Overview, Explore, Bookings and the itinerary builder.
function partyFromFunnel(profile: FunnelState): Traveller[] {
  const allergies = profile.allergies
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const groupDiet = profile.diet[0] as Traveller["diet"] | undefined;
  return profile.party.map((t) => ({
    ...t,
    diet: t.diet ?? groupDiet,
    allergies: t.allergies?.length ? t.allergies : allergies,
  }));
}

type FunnelUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Remember where they live and how they travel, for the next trip. */
async function rememberProfile(user: FunnelUser, profile: FunnelState) {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      homeCity: profile.home?.name ?? user.homeCity,
      homeLat: profile.home?.lat ?? user.homeLat,
      homeLng: profile.home?.lng ?? user.homeLng,
      homeCountry: profile.home?.countryCode ?? user.homeCountry,
      profile: {
        interests: profile.interests,
        freeText: profile.freeText,
        tripStyle: "balanced",
        scope: profile.scope,
        homeCity: profile.home?.name,
        homeCountry: profile.home?.countryCode ?? "IN",
        homeLat: profile.home?.lat,
        homeLng: profile.home?.lng,
        transport: profile.transport,
        stayTypes: [],
        budgetPerDay: profile.budgetPerDay,
        currency: "INR",
      },
    },
  });
}

export async function createTripFromDestination(
  profile: FunnelState,
  dest: DestinationResult,
) {
  const user = await getCurrentUser();
  const domestic = (profile.home?.countryCode ?? "IN") === dest.country || profile.scope === "domestic";

  const party = partyFromFunnel(profile);

  if (user) await rememberProfile(user, profile);

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
      party: { travellers: JSON.parse(JSON.stringify(party)) },
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

/**
 * The multi-city twin of createTripFromDestination. The Trip still carries the
 * FIRST stop as its destination — every existing screen reads those fields —
 * and the route itself lives in ordered Leg rows alongside it.
 */
export async function createTripFromRoute(
  profile: FunnelState,
  route: RouteResult,
) {
  const stops = route.stops;
  if (stops.length === 0) return;

  const user = await getCurrentUser();
  const first = stops[0];
  const domestic =
    stops.every((s) => s.country === (profile.home?.countryCode ?? "IN")) ||
    profile.scope === "domestic";
  const party = partyFromFunnel(profile);

  if (user) await rememberProfile(user, profile);

  // Recomputed here rather than trusted from the client: the spans must line
  // up exactly with the trip's date range, whatever arrived in the payload.
  const spans = distributeLegDates(
    profile.startDate,
    profile.endDate,
    stops.map((s) => s.nights),
  );
  const cover = COVERS[profile.interests[0]] ?? COVERS.mountains;

  const trip = await prisma.trip.create({
    data: {
      title: stops.map((s) => shortPlace(s.name)).join(" → "),
      destination: `${first.name}, ${first.country}`,
      destLat: first.lat,
      destLng: first.lng,
      destCountry: first.country,
      scope: domestic ? "domestic" : "international",
      homeCountry: profile.home?.countryCode ?? "IN",
      currency: "INR",
      homeCurrency: "INR",
      startDate: new Date(`${profile.startDate}T00:00:00.000Z`),
      endDate: new Date(`${profile.endDate}T00:00:00.000Z`),
      coverImage: cover,
      status: "PLANNING",
      origin: "planned",
      party: { travellers: JSON.parse(JSON.stringify(party)) },
      inboundAddress: `trip-${rand(4)}@in.wayfare.app`,
      shareId: rand(17),
      members: user ? { create: { userId: user.id, role: "owner" } } : undefined,
      legs: {
        create: spans.map((span, i) => ({
          order: i,
          destination: `${stops[i].name}, ${stops[i].country}`,
          lat: stops[i].lat,
          lng: stops[i].lng,
          country: stops[i].country,
          startDate: new Date(`${span.startDate}T00:00:00.000Z`),
          endDate: new Date(`${span.endDate}T00:00:00.000Z`),
          nights: span.nights,
        })),
      },
    },
    include: { legs: { orderBy: { order: "asc" } } },
  });

  // Same warm-up as the single-destination path, once per stop — Explore is
  // trip-wide, so every leg needs its own real places in there.
  after(async () => {
    for (const leg of trip.legs) {
      await suggestPlacesForLegAction(trip.id, leg.id).catch(() => {});
    }
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

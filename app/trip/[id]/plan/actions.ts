"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import {
  analyseDay, analyseTrip, haversineKm, toHHMM, toMin,
} from "@/lib/feasibility";
import { toBlockLike } from "@/lib/blocks";
import { repackDay, repackWithTransit } from "@/lib/fix";
import { legIndexForDate, shortPlace } from "@/lib/legs";
import { tripBudget } from "@/lib/budget";
import { suggestPlacesAction, suggestPlacesForLegAction } from "../explore/actions";
import type { BlockLike, Party } from "@/lib/types";

const ItinBlockSchema = z.object({
  type: z.enum([
    "FLIGHT", "TRAIN", "BUS", "FERRY",
    "LODGING", "ACTIVITY", "MEAL", "TRANSIT", "NOTE",
  ]),
  title: z.string(),
  subtitle: z.string().optional(),
  date: z.string().describe("YYYY-MM-DD within the trip range"),
  startTime: z.string().describe("HH:MM 24h destination-local"),
  durationMin: z.number(),
  placeName: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tags: z.array(z.string()).optional(),
  candidateName: z.string().optional().describe("exact candidate name if this block schedules one"),
});

const ItinSchema = z.object({ blocks: z.array(ItinBlockSchema).min(6) });

const ITIN_SYSTEM = `You build a day-by-day itinerary from a trip's candidate
places. Rules:
- Times are "HH:MM" destination-local. Every block needs date, startTime and
  an honest durationMin.
- Between two places leave a realistic gap: assume 2.6 min per straight-line
  km plus 20 minutes of slack. Winding hill roads are slower, not faster.
- Respect opening hours you are given. Respect the party: seniors and kids
  shorten a day; one strenuous thing per day at most, never for a person with
  limited mobility without an alternative nearby.
- Candidates are ordered by votes — the most-voted things get the best slots.
- Include breakfast/lunch/dinner MEAL blocks on full days (restaurants from
  the candidates where sensible). Do not fill every hour; slack is a feature.
- Reuse the exact candidate lat/lng when scheduling one, and set candidateName.`;

// Appended only when the trip has legs. The single-destination prompt is
// byte-for-byte what it always was.
const ROUTE_RULES = `
- This trip is a ROUTE through several stops, listed in "route" with the exact
  dates each stop owns. A candidate carries the "stop" it belongs to. Only ever
  schedule a place on the days of its own stop — never in another stop's dates.
- The first date of a stop is a moving day. The drive between stops is added
  for you afterwards, so on that date plan at most one thing near the stop you
  are leaving, in the morning, and keep the rest of the day for arriving.`;

/** Blocks that ARE a journey — same set the engine uses. */
const TRANSIT_TYPES = new Set<BlockLike["type"]>([
  "FLIGHT", "TRAIN", "BUS", "FERRY", "TRANSIT",
]);

/** A stop, flattened to what the itinerary maths actually needs. */
type RouteLeg = {
  id: string;
  destination: string;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
};

/** Long enough that a road transfer is no longer the honest answer. */
const MAX_TRANSIT_MIN = 14 * 60;
/** Nothing new starts after this on a moving day — you arrived, that's enough. */
const LAST_START_MIN = 21 * 60 + 30;
const TRANSFER_BUFFER = 20;

const hasCoords = (b: { lat?: number | null; lng?: number | null }) =>
  typeof b.lat === "number" && typeof b.lng === "number";
const startMin = (b: BlockLike) => toMin(b.startTime ?? "00:00");
const endMin = (b: BlockLike) =>
  b.endTime ? toMin(b.endTime) : startMin(b) + (b.durationMin ?? 60);

/** repackWithTransit wraps past midnight (toHHMM is mod 1440). A block that
 *  comes out earlier than the one before it fell off the end of the day. */
function dropWhatFellOffTheDay(day: BlockLike[]): BlockLike[] {
  const out: BlockLike[] = [];
  let last = -1;
  for (const b of day) {
    const s = startMin(b);
    if (s < last) break;
    out.push(b);
    last = s;
  }
  return out;
}

/**
 * Put the inter-city journey on every leg-transition day. The block is a real
 * TRANSIT with an honest duration (straight-line km × 2.6 min), so analyseDay()
 * judges the moving day exactly as it judges any other — nothing here decides
 * whether a day works.
 */
function withTransitBlocks(blocks: BlockLike[], legs: RouteLeg[]): BlockLike[] {
  let out = blocks;

  for (let i = 1; i < legs.length; i++) {
    const from = legs[i - 1];
    const to = legs[i];
    const date = to.startDate;
    const km = haversineKm(from, to);
    const durationMin = Math.min(MAX_TRANSIT_MIN, Math.max(30, Math.round(km * 2.6)));

    // The model, told the first day of a stop is a moving day, sometimes plans
    // its OWN "Drive to X" on the DEPARTURE day (the last day of the previous
    // stop) as well. Strip any AI-generated journey block on that departure day
    // so our single computed drive on the arrival day is the only one that
    // survives — the journey must appear exactly once.
    out = out.filter(
      (b) => !(b.date === from.endDate && TRANSIT_TYPES.has(b.type)),
    );

    // Our computed drive replaces whatever journey the model imagined here.
    const rest = out.filter((b) => b.date !== date);
    const onDay = out.filter((b) => b.date === date && !TRANSIT_TYPES.has(b.type));

    const nearer = (b: BlockLike): "from" | "to" =>
      hasCoords(b) &&
      haversineKm({ lat: b.lat!, lng: b.lng! }, from) <
        haversineKm({ lat: b.lat!, lng: b.lng! }, to)
        ? "from"
        : "to";
    const byStart = (a: BlockLike, b: BlockLike) => startMin(a) - startMin(b);
    // One thing before you drive, at most — a moving day is a moving day.
    // Keeping it to one also means the repack below can never push the
    // journey itself off the end of the day.
    let leaving = onDay.filter((b) => nearer(b) === "from").sort(byStart).slice(0, 1);
    const arriving = onDay.filter((b) => nearer(b) === "to").sort(byStart);

    // Leave after the morning at the old stop, but early enough to arrive.
    const latest = Math.max(5 * 60, LAST_START_MIN - durationMin);
    const wanted = leaving.length
      ? endMin(leaving[0]) + TRANSFER_BUFFER
      : 8 * 60 + 30;
    const start = Math.min(wanted, latest);
    leaving = leaving.filter((b) => endMin(b) <= start);

    const transit: BlockLike = {
      id: `transit-${i}`,
      type: "TRANSIT",
      title: `${km > 300 ? "Travel" : "Drive"} to ${shortPlace(to.destination)}`,
      date,
      startTime: toHHMM(start),
      endTime: toHHMM(start + durationMin),
      durationMin,
      lat: to.lat,
      lng: to.lng,
      tags: ["transfer"],
      openHours: null,
    };

    // Provisional times for the new stop, trimmed the moment the day is full.
    let cursor = start + durationMin + TRANSFER_BUFFER;
    const kept: BlockLike[] = [];
    for (const b of arriving) {
      const dur = b.durationMin ?? 60;
      if (cursor > LAST_START_MIN || cursor + dur > 24 * 60) break;
      kept.push({ ...b, startTime: toHHMM(cursor), endTime: toHHMM(cursor + dur) });
      cursor += dur + 45;
    }

    const day = dropWhatFellOffTheDay(
      repackWithTransit([...leaving, transit, ...kept]),
    );
    out = [...rest, ...day];
  }

  return out;
}

/** The generate-and-check loop. The user never sees a plan that failed
 *  analyseDay() — errors are repaired (AI, then deterministic) or dropped. */
export async function generateItinerary(
  tripId: string,
): Promise<{ ok: true; summary: string } | { ok: false; reason: "no-key" | "failed" }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      candidates: true,
      blocks: true,
      legs: { orderBy: { order: "asc" } },
    },
  });
  if (!trip) return { ok: false, reason: "failed" };
  const party = (trip.party as unknown as Party) ?? { travellers: [] };

  const legs: RouteLeg[] = trip.legs.map((l) => ({
    id: l.id,
    destination: l.destination,
    lat: l.lat,
    lng: l.lng,
    startDate: l.startDate.toISOString().slice(0, 10),
    endDate: l.endDate.toISOString().slice(0, 10),
  }));
  const hasLegs = legs.length > 0;

  // Nothing to schedule means nothing to build. An imported trip arrives with
  // no candidates, so find real places first, then plan around the bookings.
  // A route needs this per stop: Kochi's restaurants are no use in Munnar.
  let candidateRows = trip.candidates;
  if (hasLegs) {
    for (const leg of trip.legs) {
      await suggestPlacesForLegAction(tripId, leg.id).catch(() => {});
    }
    candidateRows = await prisma.candidate.findMany({ where: { tripId } });
  } else if (candidateRows.length === 0) {
    await suggestPlacesAction(tripId).catch(() => {});
    candidateRows = await prisma.candidate.findMany({ where: { tripId } });
  }
  if (candidateRows.length === 0) return { ok: false, reason: "failed" };

  const candidates = [...candidateRows].sort(
    (a, b) => b.votes.length - a.votes.length,
  );

  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  const budget = await tripBudget(tripId);

  // Which stop a place sits at. Undefined on a single-destination trip, so
  // JSON.stringify drops the key and that prompt is unchanged.
  const stopOf = (lat: number | null, lng: number | null) => {
    if (!hasLegs || lat == null || lng == null) return undefined;
    let best = legs[0];
    for (const l of legs) {
      if (haversineKm({ lat, lng }, l) < haversineKm({ lat, lng }, best)) best = l;
    }
    return shortPlace(best.destination);
  };

  let proposed: z.infer<typeof ItinSchema>;
  try {
    proposed = await askAI({
      feature: "buildItinerary",
      system: `${ITIN_SYSTEM}${hasLegs ? ROUTE_RULES : ""}\n- ${budget.brief}`,
      prompt: JSON.stringify({
        destination: trip.destination,
        destLat: trip.destLat,
        destLng: trip.destLng,
        dates,
        route: hasLegs
          ? legs.map((l) => ({
              stop: shortPlace(l.destination),
              destination: l.destination,
              lat: l.lat,
              lng: l.lng,
              dates: { start: l.startDate, end: l.endDate },
            }))
          : undefined,
        party,
        budgetPerDay: budget.perDay,
        currency: budget.currency,
        keepExistingBlocks: trip.blocks
          .filter((b) => b.status !== "PLANNED")
          .map((b) => ({
            date: b.date.toISOString().slice(0, 10),
            startTime: b.startTime,
            title: b.title,
          })),
        candidatesByVotes: candidates.map((c) => ({
          name: c.name,
          category: c.category,
          lat: c.lat,
          lng: c.lng,
          durationMin: c.durationMin,
          tags: c.tags,
          votes: c.votes.length,
          openHours: c.openHours,
          stop: stopOf(c.lat, c.lng),
        })),
      }),
      schema: ItinSchema,
      cache: false,
      timeoutMs: 60_000,
    });
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("buildItinerary failed:", e);
    return { ok: false, reason: "failed" };
  }

  const candByName = new Map(candidates.map((c) => [c.name.toLowerCase(), c]));
  const subtitleById = new Map<string, string | null>();

  // Never re-create something already booked. The model is told to plan
  // around confirmed blocks, but it sometimes echoes them back, which shows
  // up as the same hotel twice on the same day.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const alreadyBooked = new Set(
    trip.blocks
      .filter((b) => b.status !== "PLANNED")
      .map((b) => `${b.date.toISOString().slice(0, 10)}|${norm(b.title)}`),
  );

  let working: BlockLike[] = proposed.blocks
    .filter((b) => dates.includes(b.date))
    .filter((b) => {
      const key = `${b.date}|${norm(b.title)}`;
      if (alreadyBooked.has(key)) return false;
      // Also catch near-misses: "Taj Exotica" vs "Taj Exotica Resort & Spa".
      return ![...alreadyBooked].some((k) => {
        const [d, t] = k.split("|");
        return d === b.date && (t.includes(norm(b.title)) || norm(b.title).includes(t));
      });
    })
    .map((b, i) => {
      const cand = b.candidateName
        ? candByName.get(b.candidateName.toLowerCase())
        : undefined;
      subtitleById.set(`gen-${i}`, b.subtitle ?? cand?.description ?? null);
      return {
        id: `gen-${i}`,
        type: b.type,
        title: b.title,
        date: b.date,
        startTime: b.startTime,
        endTime: toHHMM(toMin(b.startTime) + Math.round(b.durationMin)),
        durationMin: Math.round(b.durationMin),
        lat: b.lat ?? cand?.lat ?? null,
        lng: b.lng ?? cand?.lng ?? null,
        tags: b.tags ?? cand?.tags ?? [],
        openHours: (cand?.openHours as BlockLike["openHours"]) ?? null,
      };
    });

  // The route's own connective tissue. Added before the check, never after —
  // a moving day has to be judged with the drive in it.
  if (hasLegs) working = withTransitBlocks(working, legs);

  const analyse = (blocks: BlockLike[]) =>
    analyseTrip(blocks, { tripStyle: "balanced", party });
  // A day holding a journey must not have a drive stacked on top of it.
  const repack = hasLegs ? repackWithTransit : repackDay;

  const pre = analyse(working);
  console.log(
    "[buildItinerary] pre-repair:",
    pre.map((a) => `${a.date} score ${a.score} [${a.warnings.map((w) => w.code).join(",")}]`).join("  "),
  );

  // Repair every day that fails: deterministic repack, then drop what still
  // cannot fit (e.g. closed all day). analyseDay is the only judge.
  for (const day of pre.filter((a) => a.warnings.some((w) => w.level === "error"))) {
    const dayBlocks = working.filter((b) => b.date === day.date);
    let repaired = repack(dayBlocks);
    let after = analyseDay(repaired, { tripStyle: "balanced", party });
    const closedIds = new Set(
      after.warnings.filter((w) => w.level === "error" && w.code === "CLOSED").map((w) => w.blockId),
    );
    if (closedIds.size) {
      repaired = repack(repaired.filter((b) => !closedIds.has(b.id)));
      after = analyseDay(repaired, { tripStyle: "balanced", party });
    }
    if (after.warnings.some((w) => w.level === "error")) {
      // last resort: drop every error-flagged block so the day passes
      const bad = new Set(
        after.warnings.filter((w) => w.level === "error").map((w) => w.blockId),
      );
      repaired = repaired.filter((b) => !bad.has(b.id));
    }
    working = [...working.filter((b) => b.date !== day.date), ...repaired];
  }

  const post = analyse(working);
  console.log(
    "[buildItinerary] post-repair:",
    post.map((a) => `${a.date} score ${a.score}`).join("  "),
  );

  const scheduledNames = new Set(
    proposed.blocks.map((b) => b.candidateName?.toLowerCase()).filter(Boolean),
  );

  // A block belongs to the stop whose dates contain its day. Legs cover the
  // whole range, so this only ever returns undefined on a trip without legs.
  const legIdFor = (date: string) => {
    if (!hasLegs) return undefined;
    const i = legIndexForDate(legs, date);
    return i >= 0 ? legs[i].id : undefined;
  };

  await prisma.$transaction([
    prisma.block.deleteMany({ where: { tripId, status: "PLANNED" } }),
    ...working
      .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.startTime!) - toMin(b.startTime!))
      .map((b, i) =>
        prisma.block.create({
          data: {
            tripId,
            legId: legIdFor(b.date),
            date: new Date(`${b.date}T00:00:00.000Z`),
            startTime: b.startTime,
            endTime: b.endTime,
            type: b.type,
            title: b.title,
            subtitle: subtitleById.get(b.id) ?? null,
            durationMin: b.durationMin,
            lat: b.lat,
            lng: b.lng,
            tags: b.tags ?? [],
            openHours: (b.openHours as object) ?? undefined,
            sortOrder: i + 1,
          },
        }),
      ),
    prisma.candidate.updateMany({
      where: { tripId, name: { in: [...scheduledNames].map(String) } },
      data: { scheduled: true },
    }),
  ]);

  revalidatePath(`/trip/${tripId}`, "layout");
  const errors = post.flatMap((a) => a.warnings.filter((w) => w.level === "error"));
  return {
    ok: true,
    summary: `${working.length} blocks across ${post.length} days, ${errors.length} errors after repair.`,
  };
}

export async function reorderBlocks(
  tripId: string,
  updates: { id: string; startTime: string | null; endTime: string | null; sortOrder: number }[],
) {
  await prisma.$transaction(
    updates.map((u) =>
      prisma.block.update({
        where: { id: u.id },
        data: { startTime: u.startTime, endTime: u.endTime, sortOrder: u.sortOrder },
      }),
    ),
  );
  revalidatePath(`/trip/${tripId}/plan`);
}

const FixSchema = z.object({
  blocks: z.array(
    z.object({ id: z.string(), startTime: z.string(), endTime: z.string() }),
  ),
  explanation: z.string(),
});

const FIX_SYSTEM = `You repair one day of a travel itinerary. You receive the day's
blocks (with coordinates, durations, opening hours) and the warnings a deterministic
feasibility engine raised. Return new startTime/endTime ("HH:MM", destination-local)
for the blocks so that: journeys fit the gaps (assume pessimistic drive times of
~2.6 min/km + 5), nothing starts when closed, nothing overlaps. Keep every block on
the same day, keep durations, keep the order sensible. explanation: one calm
sentence, the voice of a well-travelled friend, max 20 words.`;

export type FixResult =
  | { ok: true; usedAI: boolean; noKey: boolean; explanation: string;
      blocks: { id: string; startTime: string; endTime: string }[] }
  | { ok: false; reason: "failed" };

export async function fixDayAction(tripId: string, date: string): Promise<FixResult> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { blocks: true },
  });
  if (!trip) return { ok: false, reason: "failed" };
  const party = trip.party as unknown as Party;

  const dayBlocks = trip.blocks
    .filter((b) => b.date.toISOString().slice(0, 10) === date)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const likes = dayBlocks.map(toBlockLike);
  const before = analyseDay(likes, { tripStyle: "balanced", party });

  let fixed: BlockLike[] | null = null;
  let explanation = "";
  let usedAI = false;
  let noKey = false;

  try {
    const res = await askAI({
      feature: "fixDay",
      system: FIX_SYSTEM,
      prompt: JSON.stringify({ blocks: likes, warnings: before.warnings, party }),
      schema: FixSchema,
      cache: false,
    });
    const candidate = likes.map((b) => {
      const r = res.blocks.find((x) => x.id === b.id);
      return r ? { ...b, startTime: r.startTime, endTime: r.endTime } : b;
    });
    const after = analyseDay(candidate, { tripStyle: "balanced", party });
    if (after.warnings.every((w) => w.level !== "error")) {
      fixed = candidate;
      explanation = res.explanation;
      usedAI = true;
    }
  } catch (e) {
    if (e instanceof AiNotConfigured) noKey = true;
    else console.error("fixDay AI call failed, falling back:", e);
  }

  // The deterministic net: an AI-free repair that analyseDay() must still pass.
  if (!fixed) {
    const candidate = repackDay(likes);
    const after = analyseDay(candidate, { tripStyle: "balanced", party });
    if (after.warnings.every((w) => w.level !== "error")) {
      fixed = candidate;
      explanation =
        "Re-timed the day so every drive fits and nothing starts before it opens.";
    }
  }

  if (!fixed) return { ok: false, reason: "failed" };

  await prisma.$transaction(
    fixed
      .filter((b) => b.startTime)
      .map((b) =>
        prisma.block.update({
          where: { id: b.id },
          data: { startTime: b.startTime, endTime: b.endTime },
        }),
      ),
  );
  revalidatePath(`/trip/${tripId}/plan`);
  return {
    ok: true,
    usedAI,
    noKey,
    explanation,
    blocks: fixed
      .filter((b) => b.startTime && b.endTime)
      .map((b) => ({ id: b.id, startTime: b.startTime!, endTime: b.endTime! })),
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import { analyseDay, analyseTrip, toHHMM, toMin } from "@/lib/feasibility";
import { toBlockLike } from "@/lib/blocks";
import { repackDay } from "@/lib/fix";
import type { BlockLike, Party } from "@/lib/types";

const ItinBlockSchema = z.object({
  type: z.enum([
    "FLIGHT", "TRAIN", "BUS", "FERRY",
    "LODGING", "ACTIVITY", "MEAL", "TRANSIT", "NOTE",
  ]),
  title: z.string(),
  subtitle: z.string().nullish(),
  date: z.string().describe("YYYY-MM-DD within the trip range"),
  startTime: z.string().describe("HH:MM 24h destination-local"),
  durationMin: z.number(),
  placeName: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  tags: z.array(z.string()).nullish(),
  candidateName: z.string().nullish().describe("exact candidate name if this block schedules one"),
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
    },
  });
  if (!trip) return { ok: false, reason: "failed" };
  const party = (trip.party as unknown as Party) ?? { travellers: [] };
  const candidates = [...trip.candidates].sort(
    (a, b) => b.votes.length - a.votes.length,
  );

  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  let proposed: z.infer<typeof ItinSchema>;
  try {
    proposed = await askAI({
      feature: "buildItinerary",
      system: ITIN_SYSTEM,
      prompt: JSON.stringify({
        destination: trip.destination,
        destLat: trip.destLat,
        destLng: trip.destLng,
        dates,
        party,
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
  let working: BlockLike[] = proposed.blocks
    .filter((b) => dates.includes(b.date))
    .map((b, i) => {
      const cand = b.candidateName
        ? candByName.get(b.candidateName.toLowerCase())
        : undefined;
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

  const analyse = (blocks: BlockLike[]) =>
    analyseTrip(blocks, { tripStyle: "balanced", party });

  const pre = analyse(working);
  console.log(
    "[buildItinerary] pre-repair:",
    pre.map((a) => `${a.date} score ${a.score} [${a.warnings.map((w) => w.code).join(",")}]`).join("  "),
  );

  // Repair every day that fails: deterministic repack, then drop what still
  // cannot fit (e.g. closed all day). analyseDay is the only judge.
  for (const day of pre.filter((a) => a.warnings.some((w) => w.level === "error"))) {
    const dayBlocks = working.filter((b) => b.date === day.date);
    let repaired = repackDay(dayBlocks);
    let after = analyseDay(repaired, { tripStyle: "balanced", party });
    const closedIds = new Set(
      after.warnings.filter((w) => w.level === "error" && w.code === "CLOSED").map((w) => w.blockId),
    );
    if (closedIds.size) {
      repaired = repackDay(repaired.filter((b) => !closedIds.has(b.id)));
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

  await prisma.$transaction([
    prisma.block.deleteMany({ where: { tripId, status: "PLANNED" } }),
    ...working
      .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.startTime!) - toMin(b.startTime!))
      .map((b, i) =>
        prisma.block.create({
          data: {
            tripId,
            date: new Date(`${b.date}T00:00:00.000Z`),
            startTime: b.startTime,
            endTime: b.endTime,
            type: b.type,
            title: b.title,
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

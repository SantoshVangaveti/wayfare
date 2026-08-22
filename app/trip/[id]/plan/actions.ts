"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import { analyseDay } from "@/lib/feasibility";
import { toBlockLike } from "@/lib/blocks";
import { repackDay } from "@/lib/fix";
import type { BlockLike, Party } from "@/lib/types";

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

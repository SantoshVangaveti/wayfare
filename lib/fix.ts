// Deterministic day repair — the no-AI fallback behind "Fix this day".
// This file only CONSTRUCTS a candidate arrangement; analyseDay() in
// lib/feasibility.ts remains the only judge of whether a day works.

import type { BlockLike } from "./types";
import { toMin, toHHMM, travelTime, isOpenAt } from "./feasibility";

const BUFFER_MIN = 20; // slack on top of the computed drive, so nothing is "tight"

/** Keep the first block where it is, then re-time the rest of the day in
 *  order: travel time + buffer between places, pushed forward until open. */
export function repackDay(blocks: BlockLike[]): BlockLike[] {
  const timed = blocks
    .filter((b) => b.startTime)
    .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!));
  if (timed.length === 0) return blocks;

  const out = new Map<string, BlockLike>();
  let prev: BlockLike | null = null;
  let cursor = toMin(timed[0].startTime!);

  for (const b of timed) {
    let start = cursor;
    if (
      prev &&
      typeof prev.lat === "number" && typeof prev.lng === "number" &&
      typeof b.lat === "number" && typeof b.lng === "number"
    ) {
      start += travelTime(
        { lat: prev.lat, lng: prev.lng },
        { lat: b.lat, lng: b.lng },
      ).min + BUFFER_MIN;
    }
    start = Math.ceil(start / 5) * 5;
    while (
      b.openHours &&
      !isOpenAt(b.openHours, b.date, toHHMM(start)) &&
      start < 22 * 60
    ) {
      start += 15;
    }
    const dur = b.durationMin ?? 60;
    out.set(b.id, { ...b, startTime: toHHMM(start), endTime: toHHMM(start + dur) });
    cursor = start + dur;
    prev = b;
  }

  return blocks.map((b) => out.get(b.id) ?? b);
}

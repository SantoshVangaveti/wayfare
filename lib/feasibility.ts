// ============================================================================
// THE BRAIN. Pure, deterministic, no AI, no I/O, no async.
//
// The model proposes a plan; this decides whether the plan is physically
// possible. Its output is never guessed at and never varies. If you change
// anything here, re-run lib/feasibility.test.ts.
// ============================================================================

import type {
  BlockLike, DayAnalysis, OpenHours, Party, TripStyle, Warning,
} from "./types";

// ---------------------------------------------------------------- time utils

/** "09:30" -> 570 */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 145 -> "2h 25m" */
export function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Date string -> "wed". Parsed as UTC so it can never shift by timezone. */
export function weekdayOf(date: string): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

// ------------------------------------------------------------------ distance

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface Leg { km: number; min: number; mode: "walk" | "drive" }

/**
 * Straight-line distance turned into a believable door-to-door time.
 * Deliberately pessimistic: real roads are longer than great circles, and
 * a plan that is optimistic about travel is the exact failure we exist to catch.
 */
export function travelTime(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): Leg {
  const km = haversineKm(a, b);
  if (km < 1.2) return { km, min: Math.max(5, Math.round(km * 13)), mode: "walk" };
  return { km, min: Math.round(km * 2.6 + 5), mode: "drive" };
}

// -------------------------------------------------------------- opening hours

export function isOpenAt(hours: OpenHours | null | undefined, date: string, hhmm: string): boolean {
  if (!hours) return true;                       // unknown hours never block a plan
  const span = hours[weekdayOf(date)];
  if (!span) return false;                       // absent day === closed
  const t = toMin(hhmm);
  return t >= toMin(span[0]) && t <= toMin(span[1]);
}

// ---------------------------------------------------------------------- pace

const BASE_PACE: Record<TripStyle, number> = {
  relaxed: 6 * 60,
  balanced: 9 * 60,
  packed: 11 * 60,
};

/**
 * How many minutes of activity + travel this group can take in one day.
 * Kids and older travellers genuinely shorten a day; pretending otherwise is
 * how you end up with a 7-year-old crying at a viewpoint.
 */
export function paceBudget(style: TripStyle, party?: Party): number {
  let budget = BASE_PACE[style];
  const t = party?.travellers ?? [];
  if (t.some((p) => p.kind === "kid" || (p.age != null && p.age < 12))) budget *= 0.8;
  if (t.some((p) => p.kind === "senior" || (p.age != null && p.age >= 65))) budget *= 0.8;
  if (t.some((p) => p.mobility === "limited")) budget *= 0.75;
  return Math.max(240, Math.round(budget));
}

// ------------------------------------------------------------------ the check

export interface AnalyseCtx {
  tripStyle: TripStyle;
  party?: Party;
  /** last block's end time on the previous day, for the wake-up check */
  previousDayEndedAt?: string | null;
  /** minutes the group is willing to be out of bed. Default 14h. */
  dayLengthMin?: number;
}

const hasLat = (b: BlockLike): b is BlockLike & { lat: number; lng: number } =>
  typeof b.lat === "number" && typeof b.lng === "number";

const endOf = (b: BlockLike): string =>
  b.endTime ?? toHHMM(toMin(b.startTime!) + (b.durationMin ?? 60));

export function analyseDay(blocks: BlockLike[], ctx: AnalyseCtx): DayAnalysis {
  const date = blocks[0]?.date ?? "";
  const warnings: Warning[] = [];
  const timed = blocks
    .filter((b) => b.startTime)
    .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!));

  const party = ctx.party;
  const travellers = party?.travellers ?? [];
  const hasKids = travellers.some((p) => p.kind === "kid" || (p.age != null && p.age < 12));
  const limited = travellers.filter((p) => p.mobility === "limited");

  let activeMin = 0;
  let travelMin = 0;

  for (let i = 0; i < timed.length; i++) {
    const b = timed[i];
    const dur = b.durationMin ?? 60;
    if (b.type !== "LODGING") activeMin += dur;

    // 1. is it actually open
    if (b.openHours && !isOpenAt(b.openHours, b.date, b.startTime!)) {
      warnings.push({
        level: "error", code: "CLOSED", blockId: b.id,
        message: `${b.title} is closed at ${b.startTime}`,
      });
    }

    // 2. strenuous vs limited mobility
    if (limited.length && b.tags?.includes("strenuous")) {
      warnings.push({
        level: "warn", code: "MOBILITY", blockId: b.id,
        message: `${b.title} is a hard climb — difficult for ${limited.map((p) => p.name).join(" and ")}`,
      });
    }

    // 3. health flags
    for (const p of travellers) {
      for (const cond of p.health ?? []) {
        if (b.tags?.includes(cond)) {
          warnings.push({
            level: "warn", code: "HEALTH", blockId: b.id,
            message: `${b.title} may not suit ${p.name} (${cond})`,
          });
        }
      }
    }

    // 4. very early start with children
    if (hasKids && i === 0 && toMin(b.startTime!) < 6 * 60 + 30) {
      warnings.push({
        level: "warn", code: "EARLY_FOR_KIDS", blockId: b.id,
        message: `${b.startTime} start is rough with young children`,
      });
    }

    const next = timed[i + 1];
    if (!next) continue;

    const bEnd = toMin(endOf(b));
    const nextStart = toMin(next.startTime!);

    // 5. overlap
    if (nextStart < bEnd) {
      warnings.push({
        level: "error", code: "OVERLAP", blockId: next.id,
        message: `${next.title} starts before ${b.title} has finished`,
      });
      continue;                                  // gap maths is meaningless now
    }

    // 6. does the journey actually fit in the gap
    if (hasLat(b) && hasLat(next)) {
      const leg = travelTime(b, next);
      travelMin += leg.min;
      const gap = nextStart - bEnd;
      if (gap < leg.min) {
        warnings.push({
          level: "error", code: "TRAVEL_IMPOSSIBLE", blockId: next.id,
          message: `Only ${fmtDur(gap)} between ${b.title} and ${next.title}, but it's a ${fmtDur(leg.min)} ${leg.mode}`,
        });
      } else if (gap < leg.min + 15) {
        warnings.push({
          level: "warn", code: "TRAVEL_TIGHT", blockId: next.id,
          message: `Tight — ${fmtDur(gap)} for a ${fmtDur(leg.min)} ${leg.mode}, no slack at all`,
        });
      }
    }
  }

  // 7. total load against this group's real capacity
  const budget = paceBudget(ctx.tripStyle, party);
  const load = activeMin + travelMin;
  if (load > budget) {
    warnings.push({
      level: "warn", code: "OVER_PACE",
      message: `${fmtDur(load)} of activity and travel — a long day for this group`,
    });
  }

  // 8. nobody scheduled lunch
  if (load > 300 && !timed.some((b) => b.type === "MEAL")) {
    warnings.push({ level: "info", code: "NO_MEAL", message: "No meal scheduled" });
  }

  // 9. late finish followed by an early start
  if (ctx.previousDayEndedAt && timed.length) {
    const prevEnd = toMin(ctx.previousDayEndedAt);
    const firstStart = toMin(timed[0].startTime!);
    if (prevEnd >= 22 * 60 + 30 && firstStart < 7 * 60) {
      warnings.push({
        level: "warn", code: "BRUTAL_WAKEUP", blockId: timed[0].id,
        message: `Finished at ${ctx.previousDayEndedAt} and starting again at ${timed[0].startTime}`,
      });
    }
  }

  const dayLength = ctx.dayLengthMin ?? 14 * 60;
  const errors = warnings.filter((w) => w.level === "error").length;
  const warns = warnings.filter((w) => w.level === "warn").length;

  return {
    date,
    activeMin,
    travelMin,
    slackMin: Math.max(0, dayLength - load),
    paceBudgetMin: budget,
    warnings,
    score: Math.max(0, Math.min(100, 100 - errors * 25 - warns * 10)),
    get ok() { return this.score === 100; },
  };
}

/** Group blocks by date and analyse each, threading the previous day's finish. */
export function analyseTrip(blocks: BlockLike[], ctx: Omit<AnalyseCtx, "previousDayEndedAt">): DayAnalysis[] {
  const byDate = new Map<string, BlockLike[]>();
  for (const b of blocks) {
    if (!byDate.has(b.date)) byDate.set(b.date, []);
    byDate.get(b.date)!.push(b);
  }
  let prevEnd: string | null = null;
  return [...byDate.keys()].sort().map((date) => {
    const dayBlocks = byDate.get(date)!;
    const analysis = analyseDay(dayBlocks, { ...ctx, previousDayEndedAt: prevEnd });
    const timed = dayBlocks.filter((b) => b.startTime);
    prevEnd = timed.length
      ? timed.map(endOf).sort().at(-1)!
      : null;
    return analysis;
  });
}

/** Split for the load bar. Percentages always total 100. */
export function loadBar(a: DayAnalysis, dayLengthMin = 14 * 60) {
  const total = Math.max(dayLengthMin, a.activeMin + a.travelMin);
  const pct = (n: number) => (n / total) * 100;
  return {
    activePct: pct(a.activeMin),
    travelPct: pct(a.travelMin),
    slackPct: Math.max(0, 100 - pct(a.activeMin) - pct(a.travelMin)),
  };
}

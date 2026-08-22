// Multi-destination helpers. Pure date arithmetic on "YYYY-MM-DD" strings —
// never a Date in local time, so a stop can never slip a day.
// No feasibility logic lives here (see CLAUDE.md); analyseDay() stays the judge.

/** One stop's slice of the trip's date range. Contiguous, non-overlapping. */
export interface LegSpan {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  /** days this stop owns — what the strip reads as "3n" */
  nights: number;
}

/** Every date in an inclusive range, as "YYYY-MM-DD". */
export function datesBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const end = new Date(`${endISO}T00:00:00.000Z`).getTime();
  for (
    let t = new Date(`${startISO}T00:00:00.000Z`).getTime();
    t <= end;
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Split a trip's dates across its stops in the requested proportions.
 * The AI's night counts are a suggestion, not a promise: they are scaled so
 * every day of the trip belongs to exactly one stop and every stop keeps at
 * least one day. Stops beyond the number of days are dropped.
 */
export function distributeLegDates(
  startISO: string,
  endISO: string,
  requested: number[],
): LegSpan[] {
  const days = datesBetween(startISO, endISO);
  const total = days.length;
  if (total === 0 || requested.length === 0) return [];

  const want = requested
    .slice(0, Math.min(requested.length, total))
    .map((v) => Math.max(1, Math.round(v) || 1));
  const sum = want.reduce((a, b) => a + b, 0);
  const scaled = want.map((w) => (w * total) / sum);
  const size = scaled.map((x) => Math.max(1, Math.floor(x)));

  // Largest-remainder: hand the leftover days to the stops that lost the most.
  const byRemainder = scaled
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r);
  let left = total - size.reduce((a, b) => a + b, 0);
  for (let k = 0; left > 0; k++) {
    size[byRemainder[k % byRemainder.length].i]++;
    left--;
  }
  while (left < 0) {
    // The min-one-day floor over-allocated. Take back from the longest stop.
    let biggest = 0;
    for (let i = 1; i < size.length; i++) if (size[i] > size[biggest]) biggest = i;
    if (size[biggest] <= 1) break;
    size[biggest]--;
    left++;
  }

  const spans: LegSpan[] = [];
  let cursor = 0;
  for (const n of size) {
    spans.push({
      startDate: days[cursor],
      endDate: days[Math.min(cursor + n - 1, total - 1)],
      nights: n,
    });
    cursor += n;
  }
  return spans;
}

/** Which stop a given date belongs to, or -1. ISO strings compare correctly. */
export function legIndexForDate(
  spans: { startDate: string; endDate: string }[],
  date: string,
): number {
  return spans.findIndex((s) => date >= s.startDate && date <= s.endDate);
}

/** "Munnar, Kerala" → "Munnar". What the Companion would actually say. */
export function shortPlace(name: string): string {
  return name.split(",")[0].trim() || name;
}

/** "Kochi 3n · Munnar 4n · Alleppey 2n" */
export function routeLine(
  legs: { destination: string; nights: number }[],
): string {
  return legs.map((l) => `${shortPlace(l.destination)} ${l.nights}n`).join(" · ");
}

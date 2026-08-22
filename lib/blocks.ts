// Shape adapter only — turns a Prisma Block row into the looser BlockLike that
// analyseDay() consumes. No feasibility logic lives here (see CLAUDE.md).

import type { Block } from "@prisma/client";
import type { BlockLike, OpenHours } from "./types";

export function toBlockLike(b: Block): BlockLike {
  return {
    id: b.id,
    type: b.type,
    title: b.title,
    // Dates are stored as UTC midnight; slicing the ISO string can never
    // shift the day, unlike local-time formatting.
    date: b.date.toISOString().slice(0, 10),
    startTime: b.startTime,
    endTime: b.endTime,
    durationMin: b.durationMin,
    lat: b.lat,
    lng: b.lng,
    tags: b.tags,
    openHours: (b.openHours as OpenHours | null) ?? null,
    attendees: b.attendees,
  };
}

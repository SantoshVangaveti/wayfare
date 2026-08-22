// A trip starts itself. Stored status is a floor, the calendar is the truth:
// once the start date arrives the trip IS active, once the end date passes it
// IS completed — no button required. Manual ACTIVE (set early) is respected.

import { format } from "date-fns";

export type EffectiveStatus = "PLANNING" | "BOOKED" | "ACTIVE" | "COMPLETED";

export function effectiveStatus(trip: {
  status: string;
  startDate: Date;
  endDate: Date;
}): EffectiveStatus {
  if (trip.status === "COMPLETED") return "COMPLETED";
  const today = format(new Date(), "yyyy-MM-dd");
  const start = trip.startDate.toISOString().slice(0, 10);
  const end = trip.endDate.toISOString().slice(0, 10);
  if (today > end) return "COMPLETED";
  if (today >= start) return "ACTIVE";
  return trip.status as EffectiveStatus;
}

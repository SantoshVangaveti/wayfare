// What the group is willing to spend, per day, for everyone together.
// Lives on the trip owner's profile; null means "go wild".

import { prisma } from "./db";
import type { TravelProfile } from "./types";

export interface TripBudget {
  perDay: number | null;
  currency: string;
  /** A line the AI can act on, or "" when there is no limit. */
  brief: string;
}

export async function tripBudget(tripId: string): Promise<TripBudget> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      currency: true,
      members: {
        where: { role: "owner" },
        select: { user: { select: { profile: true } } },
      },
    },
  });
  const profile = trip?.members[0]?.user.profile as unknown as TravelProfile | null;
  const perDay = profile?.budgetPerDay ?? null;
  const currency = trip?.currency ?? "INR";

  return {
    perDay,
    currency,
    brief: perDay
      ? `Budget: about ${perDay} ${currency} per day for the WHOLE party, covering activities and meals. Favour options that fit; if you include something pricier, it must be worth it and the rest of that day should be cheap.`
      : "Budget: no limit given — do not skimp, but do not pad either.",
  };
}

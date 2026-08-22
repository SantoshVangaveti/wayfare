import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { Party } from "@/lib/types";
import { ExploreView } from "./ExploreView";

export const dynamic = "force-dynamic";

export default async function ExplorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trip, user] = await Promise.all([
    prisma.trip.findUnique({
      where: { id },
      include: {
        candidates: { orderBy: { rating: "desc" } },
        blocks: { where: { type: "LODGING" }, take: 1 },
      },
    }),
    getCurrentUser(),
  ]);
  if (!trip || !user) notFound();

  const party = (trip.party as unknown as Party) ?? { travellers: [] };
  const lodging = trip.blocks[0];
  const base =
    lodging?.lat != null && lodging?.lng != null
      ? { lat: lodging.lat, lng: lodging.lng, from: lodging.title }
      : { lat: trip.destLat, lng: trip.destLng, from: "town centre" };

  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  return (
    <ExploreView
      tripId={trip.id}
      destination={trip.destination}
      currentUserId={user.id}
      party={party}
      base={base}
      dates={dates}
      candidates={trip.candidates.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        description: c.description,
        lat: c.lat,
        lng: c.lng,
        durationMin: c.durationMin,
        priceLevel: c.priceLevel,
        rating: c.rating,
        tags: c.tags,
        votes: c.votes,
        scheduled: c.scheduled,
      }))}
    />
  );
}

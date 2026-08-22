import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/feasibility";
import { weatherFor } from "@/lib/weather";
import type { StoryDay, StoryStats } from "@/components/TripStory";
import { StoryView } from "./StoryView";

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
      photos: true,
    },
  });
  if (!trip) notFound();

  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  // Weather chips are decoration — failures just drop the chip.
  const weather = await Promise.allSettled(
    dates.map((d) => weatherFor(trip.destLat, trip.destLng, d, d)),
  );

  const photosByBlock = new Map<string, string[]>();
  for (const p of trip.photos) {
    if (!p.blockId) continue;
    if (!photosByBlock.has(p.blockId)) photosByBlock.set(p.blockId, []);
    photosByBlock.get(p.blockId)!.push(p.url);
  }

  const days: StoryDay[] = dates.map((date, i) => {
    const blocks = trip.blocks.filter(
      (b) => b.date.toISOString().slice(0, 10) === date,
    );
    const w = weather[i];
    return {
      date,
      dayLabel: format(parseISO(date), "EEE d"),
      highlights: blocks
        .filter((b) => ["ACTIVITY", "MEAL", "FLIGHT"].includes(b.type))
        .slice(0, 3)
        .map((b) => b.title),
      weather:
        w.status === "fulfilled" ? `${w.value.avgTempC}°C ${w.value.verdict}` : null,
      photos: blocks.flatMap((b) => photosByBlock.get(b.id) ?? []),
    };
  });

  // km along the route, straight-line between consecutive located blocks
  let km = 0;
  const located = trip.blocks.filter(
    (b) => typeof b.lat === "number" && typeof b.lng === "number",
  );
  for (let i = 1; i < located.length; i++) {
    km += haversineKm(
      { lat: located[i - 1].lat!, lng: located[i - 1].lng! },
      { lat: located[i].lat!, lng: located[i].lng! },
    );
  }

  const stats: StoryStats = {
    days: dates.length,
    places: new Set(located.map((b) => b.placeName ?? b.title)).size,
    km: Math.round(km),
    photos: trip.photos.length,
  };

  return (
    <StoryView
      tripId={trip.id}
      title={trip.title}
      destination={trip.destination}
      mode={trip.status === "COMPLETED" || trip.photos.length > 0 ? "memories" : "plan"}
      days={days}
      stats={stats}
      shareId={trip.shareId}
      shareLevel={trip.shareLevel as "itinerary" | "everything"}
    />
  );
}

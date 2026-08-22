import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { TravelProfile } from "@/lib/types";
import { BookingsView } from "./BookingsView";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { members: { include: { user: true } } },
  });
  if (!trip) notFound();

  const owner = trip.members.find((m) => m.role === "owner")?.user;
  const profile = owner?.profile as unknown as TravelProfile | null;

  return (
    <BookingsView
      tripId={trip.id}
      destination={trip.destination}
      currency={trip.currency}
      startDate={trip.startDate.toISOString().slice(0, 10)}
      endDate={trip.endDate.toISOString().slice(0, 10)}
      homeCity={owner?.homeCity ?? profile?.homeCity ?? null}
      home={
        owner?.homeLat != null && owner?.homeLng != null
          ? { lat: owner.homeLat, lng: owner.homeLng }
          : null
      }
      dest={{ lat: trip.destLat, lng: trip.destLng }}
      transportPrefs={profile?.transport ?? []}
    />
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { effectiveStatus } from "@/lib/status";
import { TripShell } from "@/components/TripShell";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    select: { id: true, status: true, startDate: true, endDate: true },
  });
  if (!trip) notFound();
  return (
    <TripShell tripId={trip.id} status={effectiveStatus(trip)}>
      {children}
    </TripShell>
  );
}

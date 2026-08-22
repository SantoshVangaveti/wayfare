import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
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
    select: { id: true, status: true },
  });
  if (!trip) notFound();
  return (
    <TripShell tripId={trip.id} status={trip.status}>
      {children}
    </TripShell>
  );
}

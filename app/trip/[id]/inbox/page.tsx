import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { ExtractResult, IngestView } from "@/lib/ingest";
import { InboxView } from "./InboxView";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { ingests: { orderBy: { createdAt: "desc" } } },
  });
  if (!trip) notFound();

  const ingests: IngestView[] = trip.ingests.map((g) => ({
    id: g.id,
    sourceType: g.sourceType,
    status: g.status,
    preview: g.rawText ? g.rawText.slice(0, 180) : null,
    hasImage: !!g.rawImage,
    parsed: (g.parsed as unknown as ExtractResult) ?? null,
    confidence: g.confidence,
  }));

  return (
    <InboxView
      tripId={trip.id}
      inboundAddress={trip.inboundAddress}
      ingests={ingests}
    />
  );
}

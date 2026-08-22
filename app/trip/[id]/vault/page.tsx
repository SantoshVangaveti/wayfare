import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { VaultView, type VaultEntry } from "./VaultView";

export const dynamic = "force-dynamic";

type Meta = Record<string, string | number | string[] | null | undefined>;

export default async function VaultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] } },
  });
  if (!trip) notFound();

  const entries: VaultEntry[] = trip.blocks
    .map((b) => {
      const meta = (b.meta as Meta) ?? {};
      const fields = Object.entries(meta)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)] as [string, string]);
      if (b.address) fields.push(["address", b.address]);
      return {
        blockId: b.id,
        date: b.date.toISOString().slice(0, 10),
        startTime: b.startTime,
        title: b.title,
        type: b.type,
        lat: b.lat,
        lng: b.lng,
        placeName: b.placeName,
        fields,
      };
    })
    .filter((e) => e.fields.length > 0);

  return <VaultView tripId={trip.id} entries={entries} />;
}

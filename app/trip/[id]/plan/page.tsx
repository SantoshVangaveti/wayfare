import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toBlockLike } from "@/lib/blocks";
import type { Party } from "@/lib/types";
import { PlanView, type PlanBlock } from "./PlanView";

export const dynamic = "force-dynamic";

export default async function PlanPage({
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
  const party = trip.party as unknown as Party;

  // Every date in the trip range, so empty days still get a tab and a ghost.
  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  const byDate = new Map<string, PlanBlock[]>(dates.map((d) => [d, []]));
  for (const b of trip.blocks) {
    const like = toBlockLike(b);
    const list = byDate.get(like.date);
    if (list) {
      list.push({
        ...like,
        subtitle: b.subtitle,
        status: b.status,
        cost: b.cost,
        sortOrder: b.sortOrder,
      });
    }
  }

  return (
    <PlanView
      tripId={trip.id}
      currency={trip.currency}
      party={party}
      days={dates.map((date) => ({ date, blocks: byDate.get(date)! }))}
    />
  );
}

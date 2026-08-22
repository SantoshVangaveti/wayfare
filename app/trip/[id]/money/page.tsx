import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { balances, settle } from "@/lib/settle";
import type { ExpenseLike } from "@/lib/types";
import { MoneyView } from "./MoneyView";

export const dynamic = "force-dynamic";

export default async function MoneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      expenses: { include: { payer: true }, orderBy: { createdAt: "asc" } },
      members: { include: { user: true } },
    },
  });
  if (!trip) notFound();

  const userIds = trip.members.map((m) => m.userId);
  const expenseLikes: ExpenseLike[] = trip.expenses.map((e) => ({
    payerId: e.payerId,
    amount: e.amount,
    shares: e.shares as Record<string, number>,
  }));

  // Both from lib/settle.ts — the only place settle-up logic lives.
  const nets = balances(expenseLikes, userIds);
  const transfers = settle(expenseLikes, userIds);

  return (
    <MoneyView
      tripId={trip.id}
      currency={trip.currency}
      members={trip.members.map((m) => ({
        id: m.userId,
        name: m.user.name,
        avatar: m.user.avatar,
      }))}
      balances={userIds.map((uid) => ({ userId: uid, net: nets.get(uid) ?? 0 }))}
      transfers={transfers}
      expenses={trip.expenses.map((e) => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        payerId: e.payerId,
        payerName: e.payer.name,
        shares: e.shares as Record<string, number>,
      }))}
    />
  );
}

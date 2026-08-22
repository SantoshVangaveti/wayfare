"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { splitEqually } from "@/lib/settle";

export async function createExpense(
  tripId: string,
  input: {
    description: string;
    amount: number;
    payerId: string;
    excludeIds: string[];
    blockId?: string | null;
  },
) {
  const { description, amount, payerId, excludeIds, blockId } = input;
  if (!description.trim() || !(amount > 0)) return { ok: false };

  const members = await prisma.tripMember.findMany({ where: { tripId } });
  const included = members
    .map((m) => m.userId)
    .filter((uid) => !excludeIds.includes(uid));
  if (included.length === 0) return { ok: false };

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  await prisma.expense.create({
    data: {
      tripId,
      payerId,
      blockId: blockId || null,
      amount,
      currency: trip?.currency ?? "INR",
      description: description.trim(),
      splitType: "equal",
      shares: splitEqually(amount, included),
    },
  });
  revalidatePath(`/trip/${tripId}/money`);
  return { ok: true };
}

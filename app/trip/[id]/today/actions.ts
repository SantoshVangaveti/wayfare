"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function toggleBlockDone(tripId: string, blockId: string) {
  const block = await prisma.block.findUnique({ where: { id: blockId } });
  if (!block || block.tripId !== tripId) return;
  await prisma.block.update({
    where: { id: blockId },
    data: { status: block.status === "DONE" ? "PLANNED" : "DONE" },
  });
  revalidatePath(`/trip/${tripId}/today`);
}

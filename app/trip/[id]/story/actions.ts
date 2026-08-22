"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/** "everything" additionally shows confirmation numbers and phones on the
 *  public page — an explicit opt-in, never a default. */
export async function setShareLevel(tripId: string, level: "itinerary" | "everything") {
  await prisma.trip.update({ where: { id: tripId }, data: { shareLevel: level } });
  revalidatePath(`/trip/${tripId}/story`);
}

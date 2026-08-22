"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { setCurrentUser } from "@/lib/session";

export async function switchUser(userId: string) {
  await setCurrentUser(userId);
  revalidatePath("/", "layout");
}

/** Deletes the trip and everything under it (blocks, candidates, expenses,
 *  photos, members cascade; ingests detach). Only reachable from the
 *  two-step confirm on Overview. */
export async function deleteTrip(tripId: string) {
  await prisma.trip.delete({ where: { id: tripId } });
  revalidatePath("/", "layout");
  redirect("/");
}

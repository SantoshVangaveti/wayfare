"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { setCurrentUser } from "@/lib/session";

export async function switchUser(userId: string) {
  await setCurrentUser(userId);
  revalidatePath("/", "layout");
}

/** Pin an imported trip to a real place, so distances, weather and place
 *  suggestions all have something to work from. */
export async function setTripDestination(
  tripId: string,
  place: { name: string; region?: string; country: string; countryCode: string; lat: number; lng: number },
) {
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      destination: `${place.name}${place.region ? `, ${place.region}` : ""}`,
      destLat: place.lat,
      destLng: place.lng,
      destCountry: place.countryCode,
    },
  });
  revalidatePath(`/trip/${tripId}`, "layout");
}

/** Start early, finish, or reopen — the calendar still auto-starts trips,
 *  this is the explicit override. */
export async function setTripStatus(
  tripId: string,
  status: "PLANNING" | "ACTIVE" | "COMPLETED",
) {
  await prisma.trip.update({ where: { id: tripId }, data: { status } });
  revalidatePath(`/trip/${tripId}`, "layout");
}

/** Deletes the trip and everything under it (blocks, candidates, expenses,
 *  photos, members cascade; ingests detach). Only reachable from the
 *  two-step confirm on Overview. */
export async function deleteTrip(tripId: string) {
  await prisma.trip.delete({ where: { id: tripId } });
  revalidatePath("/", "layout");
  redirect("/");
}

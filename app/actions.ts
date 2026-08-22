"use server";

import { revalidatePath } from "next/cache";
import { setCurrentUser } from "@/lib/session";

export async function switchUser(userId: string) {
  await setCurrentUser(userId);
  revalidatePath("/", "layout");
}

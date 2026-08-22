// No auth — the "current user" is a cookie holding a userId (see CLAUDE.md).
// A user-switcher dropdown in the top bar calls setCurrentUser via a Server Action.

import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "wf_user";

export async function getCurrentUserId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

/** Cookie user if valid, otherwise the first seeded user. */
export async function getCurrentUser() {
  const id = await getCurrentUserId();
  if (id) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) return user;
  }
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}

/** Only callable from a Server Action or Route Handler. */
export async function setCurrentUser(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, userId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

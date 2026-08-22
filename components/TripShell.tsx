import Link from "next/link";
import { Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { TabBar } from "./TabBar";
import { UserSwitcher } from "./UserSwitcher";

/** Top bar + tab bar around every trip screen. When the trip is ACTIVE,
 *  Today replaces Overview as the first (default) tab. */
export async function TripShell({
  tripId,
  status,
  children,
}: {
  tripId: string;
  status: string;
  children: React.ReactNode;
}) {
  const [users, current] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, avatar: true },
    }),
    getCurrentUser(),
  ]);

  const base = `/trip/${tripId}`;
  const tabs = [
    status === "ACTIVE"
      ? { label: "Today", href: `${base}/today` }
      : { label: "Overview", href: base },
    { label: "Plan", href: `${base}/plan` },
    { label: "Explore", href: `${base}/explore` },
    { label: "Inbox", href: `${base}/inbox` },
    { label: "Vault", href: `${base}/vault` },
    { label: "Money", href: `${base}/money` },
    { label: "Story", href: `${base}/story` },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-4">
          <div className="flex items-center justify-between gap-3 py-3">
            <Link
              href="/"
              className="font-poppins text-lg font-bold tracking-tight text-sea"
            >
              Wayfare
            </Link>
            <div className="flex items-center gap-2">
              {current && (
                <UserSwitcher users={users} currentUserId={current.id} />
              )}
              <Link
                href="/settings"
                aria-label="Settings"
                className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
              >
                <Settings className="size-5" />
              </Link>
            </div>
          </div>
          <TabBar tabs={tabs} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

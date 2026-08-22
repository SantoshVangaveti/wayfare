// Landing — two doors, a settings gear, and the Companion offering the demo
// trip. No feature list, no sign-up, no explanation.

import Image from "next/image";
import Link from "next/link";
import { Settings } from "lucide-react";
import { prisma } from "@/lib/db";
import { Companion } from "@/components/Companion";

export const dynamic = "force-dynamic";

const doors = [
  {
    href: "/plan/interests",
    image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=70",
    title: "Plan it with me",
    line: "Tell me what sounds good — I'll find where and build the days.",
  },
  {
    href: "/trip/new",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=70",
    title: "I've already booked",
    line: "Forward your confirmations — they become one organised trip.",
  },
];

export default async function Landing() {
  const demo = await prisma.trip
    .findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, title: true } })
    .catch(() => null);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="font-poppins text-xl font-bold tracking-tight text-sea">
          Wayfare
        </span>
        <Link
          href="/settings"
          aria-label="Settings"
          className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <Settings className="size-5" />
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          {doors.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group relative h-64 overflow-hidden rounded-2xl shadow-md transition hover:shadow-lg sm:h-80"
            >
              <Image
                src={d.image}
                alt=""
                fill
                priority
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="font-poppins text-xl font-bold tracking-tight text-white">
                  {d.title}
                </div>
                <div className="mt-1 text-sm text-white/85">{d.line}</div>
              </div>
            </Link>
          ))}
        </div>

        {demo && (
          <Companion
            headline="Or poke around a real trip first."
            message="A five-person family trip to Wayanad is seeded and ready — flaws included."
            actions={
              <Link
                href={`/trip/${demo.id}`}
                className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white"
              >
                Open {demo.title.split(" — ")[0]}
              </Link>
            }
          />
        )}
      </main>
    </div>
  );
}

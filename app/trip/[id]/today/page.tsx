import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Check, MapPin, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toMin, toHHMM } from "@/lib/feasibility";
import { weatherFor } from "@/lib/weather";
import { mapsUrl, telUrl } from "@/lib/maps";
import { BlockCard } from "@/components/BlockCard";
import { Chip } from "@/components/Chip";
import { Companion } from "@/components/Companion";
import { TripStateControls } from "@/components/TripStateControls";
import { cn } from "@/lib/utils";
import { toggleBlockDone } from "./actions";
import type { Block, User } from "@prisma/client";

export const dynamic = "force-dynamic";

type Meta = { phone?: string } | null;

export default async function TodayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trip, user] = await Promise.all([
    prisma.trip.findUnique({
      where: { id },
      include: {
        blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
        members: { include: { user: true } },
      },
    }),
    getCurrentUser(),
  ]);
  if (!trip || !user) notFound();

  const members = trip.members.map((m) => m.user);

  // Which trip day is "today"? Outside the trip window, preview the nearest day.
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const startStr = trip.startDate.toISOString().slice(0, 10);
  const endStr = trip.endDate.toISOString().slice(0, 10);
  const activeDate =
    todayStr < startStr ? startStr : todayStr > endStr ? endStr : todayStr;
  const previewing = activeDate !== todayStr;
  const dayNumber =
    Math.round(
      (new Date(`${activeDate}T00:00:00Z`).getTime() - trip.startDate.getTime()) /
        86_400_000,
    ) + 1;

  const dayBlocks = trip.blocks
    .filter((b) => b.date.toISOString().slice(0, 10) === activeDate && b.startTime)
    .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!));

  const isIn = (b: Block, userId: string) =>
    b.attendees.length === 0 || b.attendees.includes(userId);

  // YOUR wake-up: derived from the first block you are actually in.
  const myFirst = dayBlocks.find((b) => isIn(b, user.id));
  const wakeUp = myFirst?.startTime
    ? toHHMM(Math.floor((toMin(myFirst.startTime) - 45) / 15) * 15)
    : null;

  // Who's doing what — only worth saying when the group splits.
  const splits = dayBlocks.filter((b) => b.attendees.length > 0);
  const whoLine =
    splits.length === 0
      ? "Everyone's together today."
      : splits
          .map((b) => {
            const names = members
              .filter((m) => b.attendees.includes(m.id))
              .map((m) => m.name);
            return `${names.join(" & ")}: ${b.title}`;
          })
          .join(" · ");

  // Weather is decoration, never a blocker — a failed fetch just drops the line.
  let weatherLine = "";
  try {
    const w = await weatherFor(trip.destLat, trip.destLng, activeDate, activeDate);
    weatherLine = `${w.summary}. `;
  } catch {}

  const endOf = (b: Block) =>
    b.endTime ?? toHHMM(toMin(b.startTime!) + (b.durationMin ?? 60));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const status = (b: Block): "earlier" | "now" | "next" | "later" => {
    if (previewing) return "later";
    if (toMin(endOf(b)) <= nowMin) return "earlier";
    if (toMin(b.startTime!) <= nowMin) return "now";
    const firstUpcoming = dayBlocks.find((x) => toMin(x.startTime!) > nowMin);
    return firstUpcoming?.id === b.id ? "next" : "later";
  };

  const sections: { key: string; label: string; blocks: Block[] }[] = [
    { key: "now", label: "Now", blocks: dayBlocks.filter((b) => status(b) === "now") },
    { key: "next", label: "Next", blocks: dayBlocks.filter((b) => status(b) === "next") },
    {
      key: "later",
      label: previewing ? `Day ${dayNumber}` : "Later",
      blocks: dayBlocks.filter((b) => status(b) === "later"),
    },
    { key: "earlier", label: "Earlier", blocks: dayBlocks.filter((b) => status(b) === "earlier") },
  ].filter((s) => s.blocks.length > 0);

  const avatarRow = (b: Block) => (
    <div className="flex -space-x-1.5">
      {members
        .filter((m) => isIn(b, m.id))
        .map((m) => (
          <span
            key={m.id}
            title={m.name}
            className="flex size-5 items-center justify-center rounded-full border border-surface bg-sea-soft font-poppins text-[10px] font-semibold text-sea"
          >
            {m.avatar ?? m.name[0]}
          </span>
        ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <Companion
        headline={`Good morning, ${user.name}.`}
        message={
          weatherLine +
          whoLine +
          (wakeUp && myFirst
            ? ` Wake by ${wakeUp} to make ${myFirst.title} at ${myFirst.startTime}.`
            : " Nothing on your plate until later.")
        }
        actions={
          previewing ? (
            <Chip variant="neutral">
              previewing day {dayNumber} · trip starts {format(trip.startDate, "d MMM")}
            </Chip>
          ) : undefined
        }
      />

      {sections.map((s) => (
        <section key={s.key} className="space-y-2">
          <h2
            className={cn(
              "font-poppins text-base font-bold tracking-tight",
              s.key === "earlier" && "text-ink-3",
            )}
          >
            {s.label}
          </h2>
          {s.blocks.map((b) => {
            const meta = b.meta as Meta;
            const done = b.status === "DONE";
            return (
              <BlockCard
                key={b.id}
                variant={done ? "done" : s.key === "now" ? "warn" : "default"}
                className={s.key === "now" ? "border-sea bg-sea-soft/40" : undefined}
                startTime={b.startTime}
                endTime={b.endTime}
                title={b.title}
                subtitle={b.subtitle}
                chip={
                  <div className="flex items-center gap-1.5">
                    {meta?.phone && (
                      <a
                        href={telUrl(meta.phone)}
                        aria-label={`Call ${b.title}`}
                        className="rounded-lg border border-line bg-surface p-1.5 text-sea hover:bg-sea-soft"
                      >
                        <Phone className="size-4" />
                      </a>
                    )}
                    {b.lat != null && b.lng != null && (
                      <a
                        href={mapsUrl(b.lat, b.lng, b.placeName ?? b.title)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Map for ${b.title}`}
                        className="rounded-lg border border-line bg-surface p-1.5 text-sea hover:bg-sea-soft"
                      >
                        <MapPin className="size-4" />
                      </a>
                    )}
                    <form action={toggleBlockDone.bind(null, trip.id, b.id)}>
                      <button
                        aria-label={done ? `Mark ${b.title} not done` : `Mark ${b.title} done`}
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full border transition",
                          done
                            ? "border-ok bg-ok text-white"
                            : "border-line-2 bg-surface text-ink-3 hover:border-ok hover:text-ok",
                        )}
                      >
                        <Check className="size-4" />
                      </button>
                    </form>
                  </div>
                }
              >
                {avatarRow(b)}
              </BlockCard>
            );
          })}
        </section>
      ))}

      {dayBlocks.length === 0 && (
        <BlockCard
          variant="ghost"
          title="Nothing planned today"
          subtitle="A free day — pick something from Explore"
          chip={
            <Link
              href={`/trip/${trip.id}/explore`}
              className="font-poppins text-xs font-semibold text-sea"
            >
              Explore →
            </Link>
          }
        />
      )}

      <div className="flex justify-end pt-2">
        <TripStateControls tripId={trip.id} status={trip.status} />
      </div>
    </div>
  );
}

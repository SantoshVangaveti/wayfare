import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { BedDouble, Luggage } from "lucide-react";
import { prisma } from "@/lib/db";
import { effectiveStatus } from "@/lib/status";
import { suggestPlacesAction } from "./explore/actions";
import { analyseTrip, toMin } from "@/lib/feasibility";
import { toBlockLike } from "@/lib/blocks";
import { routeLine, shortPlace } from "@/lib/legs";
import type { Party, TravelProfile } from "@/lib/types";
import { BlockCard } from "@/components/BlockCard";
import { DeleteTrip } from "@/components/DeleteTrip";
import { TripStateControls } from "@/components/TripStateControls";
import { LoadBar } from "@/components/LoadBar";
import { Chip } from "@/components/Chip";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
      legs: { orderBy: { order: "asc" } },
      members: { include: { user: true } },
      expenses: true,
      candidates: { select: { id: true }, take: 1 },
    },
  });
  if (!trip) notFound();
  if (effectiveStatus(trip) === "ACTIVE") redirect(`/trip/${id}/today`);

  // Second chance to warm Explore: opening the Overview of a trip that has
  // no candidates yet starts the places call in the background.
  if (trip.candidates.length === 0 && trip.destLat !== 0) {
    after(async () => {
      await suggestPlacesAction(trip.id).catch(() => {});
    });
  }

  const party = trip.party as unknown as Party;
  const likes = trip.blocks.map(toBlockLike);
  const analyses = new Map(
    analyseTrip(likes, { tripStyle: "balanced", party }).map((a) => [a.date, a]),
  );

  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: trip.currency,
    maximumFractionDigits: 0,
  });
  const spent = trip.expenses.reduce((s, e) => s + e.amount, 0);
  const owner = trip.members.find((m) => m.role === "owner")?.user;
  const profile = owner?.profile as unknown as TravelProfile | null;
  const budget = profile?.budgetPerDay ? profile.budgetPerDay * dates.length : null;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nextUp = trip.blocks.find(
    (b) =>
      b.startTime &&
      (b.date.toISOString().slice(0, 10) > todayStr ||
        (b.date.toISOString().slice(0, 10) === todayStr &&
          toMin(b.startTime) > new Date().getHours() * 60 + new Date().getMinutes())),
  );
  const daysToGo = Math.max(
    0,
    Math.ceil((trip.startDate.getTime() - Date.now()) / 86_400_000),
  );

  return (
    <div className="space-y-6">
      {/* cover */}
      <div className="relative h-52 overflow-hidden rounded-2xl sm:h-64">
        {trip.coverImage && (
          <Image
            src={trip.coverImage}
            alt={trip.destination}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
          <div>
            <h1 className="font-poppins text-2xl font-bold tracking-tight text-white">
              {trip.title}
            </h1>
            <div className="mt-1 font-mono text-sm text-white/85">
              {format(trip.startDate, "d MMM")} – {format(trip.endDate, "d MMM yyyy")}
              {daysToGo > 0 && ` · in ${daysToGo} days`}
            </div>
          </div>
          <div className="flex -space-x-2">
            {trip.members.map((m) => (
              <span
                key={m.id}
                title={m.user.name}
                className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-sea font-poppins text-xs font-semibold text-white"
              >
                {m.user.avatar ?? m.user.name[0]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* the route — only a multi-destination trip has legs */}
      {trip.legs.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-poppins text-base font-bold tracking-tight">
              The route
            </h2>
            <span className="truncate font-mono text-xs tabular-nums text-ink-3">
              {routeLine(trip.legs)}
            </span>
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {trip.legs.map((leg, i) => (
              <li
                key={leg.id}
                className="flex min-w-40 shrink-0 items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sea font-mono text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-poppins text-sm font-semibold">
                    {shortPlace(leg.destination)}
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-ink-3">
                    {format(leg.startDate, "d MMM")}–{format(leg.endDate, "d MMM")} ·{" "}
                    {leg.nights}n
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* day strip */}
      <section className="space-y-2">
        <h2 className="font-poppins text-base font-bold tracking-tight">
          The shape of the trip
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dates.map((date, i) => {
            const a = analyses.get(date);
            const hasError = a?.warnings.some((w) => w.level === "error");
            return (
              <Link
                key={date}
                href={`/trip/${trip.id}/plan`}
                className={cn(
                  "rounded-xl border bg-surface p-3 shadow-sm transition hover:border-line-2",
                  hasError ? "border-mango" : "border-line",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-poppins text-xs font-semibold text-ink">
                    Day {i + 1}
                    <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-3">
                      {format(parseISO(date), "EEE d")}
                    </span>
                  </span>
                  {a ? (
                    <Chip variant={hasError ? "mango" : a.score === 100 ? "ok" : "neutral"}>
                      {a.score}
                    </Chip>
                  ) : (
                    <Chip>empty</Chip>
                  )}
                </div>
                {a ? (
                  <LoadBar
                    activeMin={a.activeMin}
                    travelMin={a.travelMin}
                    slackMin={a.slackMin}
                    showKey={false}
                  />
                ) : (
                  <div className="h-2.5 rounded-full border border-dashed border-line-2" />
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* budget vs actual */}
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-poppins text-base font-bold tracking-tight">Expenses</h2>
          <div className="mt-3 flex items-baseline justify-between font-mono text-sm">
            <span className="text-ink">{money.format(spent)} spent</span>
            {budget && <span className="text-ink-3">{money.format(budget)} planned</span>}
          </div>
          {budget && (
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper-2">
              <div
                className={cn("h-full rounded-full", spent > budget ? "bg-mango" : "bg-ok")}
                style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
              />
            </div>
          )}
          <Link
            href={`/trip/${trip.id}/money`}
            className="mt-3 inline-block font-poppins text-xs font-semibold text-sea"
          >
            Settle up →
          </Link>
        </section>

        {/* next up */}
        <section className="space-y-2">
          <h2 className="font-poppins text-base font-bold tracking-tight">Next up</h2>
          {nextUp ? (
            <BlockCard
              startTime={nextUp.startTime}
              endTime={nextUp.endTime}
              title={nextUp.title}
              subtitle={nextUp.subtitle}
              chip={
                <Chip variant="sea">
                  {format(nextUp.date, "EEE d MMM")}
                </Chip>
              }
            />
          ) : (
            <BlockCard variant="ghost" title="Nothing scheduled yet" />
          )}
        </section>
      </div>

      {/* bookings + packing */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/trip/${trip.id}/bookings`}
          className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:border-line-2"
        >
          <BedDouble className="size-5 text-sea" />
          <div>
            <div className="font-poppins text-sm font-semibold">Bookings</div>
            <div className="text-xs text-ink-3">Stay + transport options</div>
          </div>
        </Link>
        <Link
          href={`/trip/${trip.id}/packing`}
          className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:border-line-2"
        >
          <Luggage className="size-5 text-sea" />
          <div>
            <div className="font-poppins text-sm font-semibold">Packing</div>
            <div className="text-xs text-ink-3">Weather-aware list</div>
          </div>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <TripStateControls tripId={trip.id} status={trip.status} />
        <DeleteTrip tripId={trip.id} title={trip.title} />
      </div>
    </div>
  );
}

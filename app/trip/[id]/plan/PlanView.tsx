"use client";

// The brain's screen. All feasibility maths comes from analyseDay() /
// analyseTrip() in lib/feasibility.ts — pure functions, so reordering
// re-analyses locally and instantly. Nothing here judges a day itself.

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp, Sparkles, Wand2 } from "lucide-react";
import {
  analyseTrip, fmtDur, toHHMM, toMin,
} from "@/lib/feasibility";
import type { BlockLike, Party, Warning } from "@/lib/types";
import { BlockCard } from "@/components/BlockCard";
import { LoadBar } from "@/components/LoadBar";
import { Chip } from "@/components/Chip";
import { Companion } from "@/components/Companion";
import { cn } from "@/lib/utils";
import { fixDayAction, generateItinerary, reorderBlocks } from "./actions";

export type PlanBlock = BlockLike & {
  subtitle: string | null;
  status: string;
  cost: number | null;
  sortOrder: number;
};

const GHOST_GAP_MIN = 150;

export function PlanView({
  tripId,
  currency,
  party,
  days: initialDays,
}: {
  tripId: string;
  currency: string;
  party: Party;
  days: { date: string; blocks: PlanBlock[] }[];
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const firstWithBlocks = initialDays.find((d) => d.blocks.length)?.date;
  const [selected, setSelected] = useState(firstWithBlocks ?? initialDays[0]?.date);
  const [fixNote, setFixNote] = useState<string | null>(null);
  const [fixNoKey, setFixNoKey] = useState(false);
  const [building, setBuilding] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => setDays(initialDays), [initialDays]);
  const totalBlocks = days.reduce((n, d) => n + d.blocks.length, 0);

  function buildDays() {
    setBuilding(true);
    setFixNote(null);
    generateItinerary(tripId)
      .then((res) => {
        if (res.ok) {
          setFixNote("Built the days from everyone's votes — checked and repaired.");
          router.refresh();
        } else {
          setFixNote(
            res.reason === "no-key"
              ? "No AI key yet — add one in Settings."
              : "The model hiccuped — try again.",
          );
        }
      })
      .finally(() => setBuilding(false));
  }

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [currency],
  );

  // Pure + fast: re-runs on every local change, instantly. Never an API call.
  const analyses = useMemo(() => {
    const all = days.flatMap((d) => d.blocks);
    const list = analyseTrip(all, { tripStyle: "balanced", party });
    return new Map(list.map((a) => [a.date, a]));
  }, [days, party]);

  const day = days.find((d) => d.date === selected);
  const analysis = selected ? analyses.get(selected) : undefined;
  const warnings: Warning[] = analysis?.warnings ?? [];
  const errors = warnings.filter((w) => w.level === "error");
  const chipsFor = (blockId: string) => warnings.filter((w) => w.blockId === blockId);

  const sortedBlocks = useMemo(() => {
    if (!day) return [];
    return [...day.blocks].sort((a, b) => {
      if (a.startTime && b.startTime) return toMin(a.startTime) - toMin(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }, [day]);

  function move(index: number, dir: -1 | 1) {
    if (!day) return;
    const j = index + dir;
    if (j < 0 || j >= sortedBlocks.length) return;
    const a = sortedBlocks[index];
    const b = sortedBlocks[j];
    if (!a.startTime || !b.startTime) return;

    // Swap time slots; each keeps its own duration. analyseDay() will say
    // instantly whether the new arrangement survives.
    const aDur = a.durationMin ?? (a.endTime ? toMin(a.endTime) - toMin(a.startTime) : 60);
    const bDur = b.durationMin ?? (b.endTime ? toMin(b.endTime) - toMin(b.startTime) : 60);
    const newA = { ...a, startTime: b.startTime, endTime: toHHMM(toMin(b.startTime) + aDur) };
    const newB = { ...b, startTime: a.startTime, endTime: toHHMM(toMin(a.startTime) + bDur) };

    setFixNote(null);
    setDays((prev) =>
      prev.map((d) =>
        d.date !== day.date
          ? d
          : {
              ...d,
              blocks: d.blocks.map((x) =>
                x.id === a.id ? newA : x.id === b.id ? newB : x,
              ),
            },
      ),
    );
    startTransition(() =>
      reorderBlocks(tripId, [
        { id: newA.id, startTime: newA.startTime, endTime: newA.endTime, sortOrder: j },
        { id: newB.id, startTime: newB.startTime, endTime: newB.endTime, sortOrder: index },
      ]),
    );
  }

  function fixDay() {
    if (!day) return;
    startTransition(async () => {
      const res = await fixDayAction(tripId, day.date);
      if (!res.ok) {
        setFixNote("Couldn't repair this day automatically — try moving a block.");
        return;
      }
      setDays((prev) =>
        prev.map((d) =>
          d.date !== day.date
            ? d
            : {
                ...d,
                blocks: d.blocks.map((x) => {
                  const r = res.blocks.find((y) => y.id === x.id);
                  return r ? { ...x, startTime: r.startTime, endTime: r.endTime } : x;
                }),
              },
        ),
      );
      setFixNote(res.explanation);
      setFixNoKey(res.noKey);
    });
  }

  const statusChip = (b: PlanBlock) => {
    if (b.status === "DONE") return <Chip variant="ok">Done</Chip>;
    if (b.status === "CONFIRMED") return <Chip variant="ok">Confirmed</Chip>;
    if (b.cost) return <Chip>{money.format(b.cost)}</Chip>;
    return undefined;
  };

  return (
    <div className="space-y-4">
      {/* day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d, i) => {
          const a = analyses.get(d.date);
          const dayErrors = a?.warnings.some((w) => w.level === "error");
          const dayWarns = a?.warnings.some((w) => w.level === "warn");
          const active = d.date === selected;
          return (
            <button
              key={d.date}
              onClick={() => { setSelected(d.date); setFixNote(null); }}
              className={cn(
                "flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 transition-colors",
                active
                  ? "border-sea bg-sea-soft text-sea"
                  : "border-line bg-surface text-ink-2 hover:border-line-2",
              )}
            >
              <span className="font-poppins text-xs font-semibold">Day {i + 1}</span>
              <span className="flex items-center gap-1 font-mono text-[11px]">
                {format(parseISO(d.date), "EEE d")}
                {dayErrors ? (
                  <span className="size-1.5 rounded-full bg-mango" />
                ) : dayWarns ? (
                  <span className="size-1.5 rounded-full bg-sun" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* timeline */}
        <div className="space-y-2">
          {fixNote && (
            <Companion
              headline={errors.length === 0 ? "That works now." : "Hmm."}
              message={fixNote + (fixNoKey ? " (Local fix — add an AI key in Settings for smarter repairs.)" : "")}
            />
          )}
          {sortedBlocks.length === 0 && (
            <BlockCard
              variant="ghost"
              title="What should we do here?"
              subtitle="This day is empty — pick something from Explore"
              chip={
                <Link href={`/trip/${tripId}/explore`} className="font-poppins text-xs font-semibold text-sea">
                  Explore →
                </Link>
              }
            />
          )}
          {sortedBlocks.map((b, i) => {
            const blockWarnings = chipsFor(b.id);
            const hasError = blockWarnings.some((w) => w.level === "error");
            const hasWarn = blockWarnings.length > 0;
            const next = sortedBlocks[i + 1];
            const gap =
              b.endTime && next?.startTime
                ? toMin(next.startTime) - toMin(b.endTime)
                : 0;
            return (
              <div key={b.id} className="space-y-2">
                <div className="group relative">
                  <BlockCard
                    variant={hasError || hasWarn ? "warn" : b.status === "DONE" ? "done" : "default"}
                    startTime={b.startTime}
                    endTime={b.endTime}
                    title={b.title}
                    subtitle={b.subtitle}
                    chip={statusChip(b)}
                  >
                    {blockWarnings.map((w) => (
                      <Chip key={w.code + w.blockId} variant="mango">
                        {w.message}
                      </Chip>
                    ))}
                  </BlockCard>
                  {/* reorder controls */}
                  <div className="absolute -left-0.5 top-1/2 flex -translate-x-full -translate-y-1/2 flex-col gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      aria-label="Move earlier"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="rounded p-0.5 text-ink-3 hover:bg-paper-2 hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      aria-label="Move later"
                      disabled={i === sortedBlocks.length - 1}
                      onClick={() => move(i, 1)}
                      className="rounded p-0.5 text-ink-3 hover:bg-paper-2 hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
                </div>
                {gap >= GHOST_GAP_MIN && (
                  <BlockCard
                    variant="ghost"
                    startTime={b.endTime}
                    endTime={next?.startTime}
                    title="What should we do here?"
                    subtitle={`${fmtDur(gap)} free`}
                    chip={
                      <Link href={`/trip/${tripId}/explore`} className="font-poppins text-xs font-semibold text-sea">
                        Explore →
                      </Link>
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* feasibility rail */}
        <aside className="lg:sticky lg:top-32 h-fit space-y-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-poppins text-sm font-bold tracking-tight">
              Does this day work?
            </h2>
            {analysis && (
              <Chip variant={errors.length ? "mango" : warnings.length ? "neutral" : "ok"}>
                score {analysis.score}
              </Chip>
            )}
          </div>
          {totalBlocks < 3 && (
            <button
              onClick={buildDays}
              disabled={building}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-sea px-4 py-2.5 font-poppins text-sm font-semibold text-white transition hover:opacity-90",
                building && "opacity-60",
              )}
            >
              <Sparkles className="size-4" />
              {building ? "Building your days…" : "Build my days with AI"}
            </button>
          )}
          {analysis && (
            <>
              <LoadBar
                activeMin={analysis.activeMin}
                travelMin={analysis.travelMin}
                slackMin={analysis.slackMin}
              />
              <div className="font-mono text-[11px] text-ink-3">
                pace budget {fmtDur(analysis.paceBudgetMin)} for this group
              </div>
              {warnings.length > 0 ? (
                <ul className="space-y-2">
                  {warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          w.level === "error" ? "bg-mango" : w.level === "warn" ? "bg-sun" : "bg-line-2",
                        )}
                      />
                      <span className="text-ink-2">{w.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-2">
                  Everything fits. Distances, opening hours, and the group's pace all check out.
                </p>
              )}
              <button
                onClick={fixDay}
                disabled={pending || sortedBlocks.length === 0}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-poppins text-sm font-semibold text-white transition",
                  errors.length ? "bg-mango hover:opacity-90" : "bg-sea hover:opacity-90",
                  pending && "opacity-60",
                )}
              >
                <Wand2 className="size-4" />
                {pending ? "Thinking…" : "Fix this day"}
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

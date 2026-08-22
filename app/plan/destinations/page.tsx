"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";
import { loadFunnel, type FunnelState } from "@/lib/funnel";
import { Chip } from "@/components/Chip";
import { Companion } from "@/components/Companion";
import { cn } from "@/lib/utils";
import {
  createTripFromDestination, suggestDestinationsAction, type DestinationResult,
} from "../actions";

const VERDICT_VARIANT: Record<string, "ok" | "mango" | "neutral"> = {
  GOOD: "ok",
  MIXED: "neutral",
  MONSOON: "mango",
  EXTREME_HEAT: "mango",
  COLD: "neutral",
};

type Status = "loading" | "ready" | "no-key" | "failed";

export default function DestinationsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<FunnelState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [picking, startPick] = useTransition();
  const [pickedName, setPickedName] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    const p = loadFunnel();
    if (!p || p.interests.length === 0) {
      router.replace("/plan/interests");
      return;
    }
    setProfile(p);
  }, [router]);

  useEffect(() => {
    if (!profile || ran.current) return;
    ran.current = true;
    run(profile);
  }, [profile]);

  function run(p: FunnelState) {
    setStatus("loading");
    suggestDestinationsAction(p).then((res) => {
      if (res.ok) {
        setResults(res.destinations);
        setStatus("ready");
      } else {
        setStatus(res.reason === "no-key" ? "no-key" : "failed");
      }
    });
  }

  function pick(dest: DestinationResult) {
    if (!profile) return;
    setPickedName(dest.name);
    startPick(() => createTripFromDestination(profile, dest));
  }

  const [top, ...rest] = results;

  return (
    <div className="space-y-5">
      <h1 className="font-poppins text-2xl font-bold tracking-tight">
        Five places that fit
      </h1>

      {status === "loading" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="size-4 animate-spin text-sea" />
            Reading what you told us…
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                "animate-pulse rounded-2xl bg-paper-2",
                i === 0 ? "h-44" : "h-16",
              )}
            />
          ))}
        </div>
      )}

      {status === "no-key" && (
        <Companion
          headline="No AI key configured."
          message="Add one in Settings and come straight back — everything you typed is saved."
          actions={
            <Link
              href="/settings"
              className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white"
            >
              Open Settings
            </Link>
          }
        />
      )}

      {status === "failed" && (
        <Companion
          headline="That didn't go through."
          message="The model timed out or hiccuped. Your answers are saved — try again."
          actions={
            <button
              onClick={() => profile && run(profile)}
              className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white"
            >
              Try again
            </button>
          }
        />
      )}

      {status === "ready" && top && (
        <>
          {/* the top match — large */}
          <button
            onClick={() => pick(top)}
            disabled={picking}
            className="group relative w-full overflow-hidden rounded-2xl border-2 border-sea bg-ink text-left shadow-md"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sea to-ink opacity-90" />
            <div className="relative p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-poppins text-2xl font-bold tracking-tight">
                    {top.name}
                  </div>
                  <div className="font-mono text-xs text-white/70">{top.country}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-3xl font-bold">{top.matchScore}%</div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-white/70">
                    match
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-white/90">
                {top.why.split("\n").filter(Boolean).map((line, i) => (
                  <div key={i}>· {line.trim()}</div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {top.weather && (
                  <Chip variant={VERDICT_VARIANT[top.weather.verdict] ?? "neutral"}>
                    {top.weather.verdict.replace("_", " ")}
                  </Chip>
                )}
                <Chip className="bg-white/15 text-white">
                  ~₹{Math.round(top.estCostPerDay).toLocaleString("en-IN")}/day
                </Chip>
                <span className="ml-auto font-poppins text-sm font-semibold">
                  {picking && pickedName === top.name ? "Creating trip…" : "Pick this →"}
                </span>
              </div>
            </div>
          </button>

          {/* the rest — compact rows */}
          <div className="space-y-2">
            {rest.map((d) => (
              <button
                key={d.name}
                onClick={() => pick(d)}
                disabled={picking}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition hover:border-sea"
              >
                <MapPin className="size-4 shrink-0 text-sea" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-poppins text-sm font-semibold">{d.name}</span>
                    <span className="font-mono text-[11px] text-ink-3">{d.country}</span>
                  </div>
                  <div className="truncate text-xs text-ink-2">
                    {d.why.split("\n")[0]}
                  </div>
                </div>
                {d.weather && (
                  <Chip variant={VERDICT_VARIANT[d.weather.verdict] ?? "neutral"}>
                    {d.weather.verdict.replace("_", " ")}
                  </Chip>
                )}
                <span className="font-mono text-sm font-semibold text-sea">
                  {picking && pickedName === d.name ? "…" : `${d.matchScore}%`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

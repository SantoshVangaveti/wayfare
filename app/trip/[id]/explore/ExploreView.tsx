"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  CalendarPlus, ExternalLink, Heart, Loader2, MapPin, Star,
} from "lucide-react";
import { haversineKm, fmtDur } from "@/lib/feasibility";
import { mapsUrl } from "@/lib/maps";
import type { Party } from "@/lib/types";
import { Chip } from "@/components/Chip";
import { Companion } from "@/components/Companion";
import { cn } from "@/lib/utils";
import { addCandidateToDay, suggestPlacesAction, toggleVote } from "./actions";

interface CandidateView {
  id: string;
  name: string;
  category: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  durationMin: number;
  priceLevel: number | null;
  rating: number | null;
  tags: string[];
  votes: string[];
  scheduled: boolean;
}

type Status = "idle" | "loading" | "no-key" | "failed";

export function ExploreView({
  tripId,
  destination,
  currentUserId,
  party,
  base,
  dates,
  candidates,
}: {
  tripId: string;
  destination: string;
  currentUserId: string;
  party: Party;
  base: { lat: number; lng: number; from: string };
  dates: string[];
  candidates: CandidateView[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(candidates.length ? "idle" : "loading");
  const [filter, setFilter] = useState<"all" | "activity" | "restaurant">("all");
  const [showHidden, setShowHidden] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ran = useRef(false);

  const hasVegParty = party.travellers.some((t) =>
    ["veg", "vegan", "jain"].includes(t.diet ?? ""),
  );
  const allergies = [...new Set(party.travellers.flatMap((t) => t.allergies ?? []))];
  const limited = party.travellers.filter((t) => t.mobility === "limited");

  useEffect(() => {
    if (candidates.length || ran.current) return;
    ran.current = true;
    suggestPlacesAction(tripId).then((res) => {
      if (res.ok) {
        setStatus("idle");
        router.refresh();
      } else {
        setStatus(res.reason === "no-key" ? "no-key" : "failed");
      }
    });
  }, [candidates.length, tripId, router]);

  const dietHidden = useMemo(
    () =>
      hasVegParty
        ? candidates.filter(
            (c) => c.category === "restaurant" && c.tags.includes("nonveg"),
          )
        : [],
    [candidates, hasVegParty],
  );

  const visible = candidates.filter((c) => {
    if (filter !== "all" && c.category !== filter) return false;
    if (!showHidden && dietHidden.some((h) => h.id === c.id)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "activity", "restaurant"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition",
              filter === f
                ? "border-sea bg-sea-soft text-sea"
                : "border-line bg-surface text-ink-2",
            )}
          >
            {f === "all" ? "everything" : f === "activity" ? "activities" : "food"}
          </button>
        ))}
        {hasVegParty && dietHidden.length > 0 && (
          <button
            onClick={() => setShowHidden((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide",
              showHidden
                ? "border-line bg-surface text-ink-3"
                : "border-sea bg-sea-soft text-sea",
            )}
          >
            vegetarian · {dietHidden.length} hidden
          </button>
        )}
      </div>

      {status === "loading" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="size-4 animate-spin text-sea" />
            Finding real places around {destination}…
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-paper-2" />
            ))}
          </div>
        </div>
      )}

      {status === "no-key" && (
        <Companion
          headline="No AI key configured."
          message="Add one in Settings and this screen fills itself."
          actions={
            <Link href="/settings" className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white">
              Open Settings
            </Link>
          }
        />
      )}
      {status === "failed" && (
        <Companion
          headline="Couldn't fetch ideas."
          message="The model hiccuped — try again."
          actions={
            <button
              onClick={() => {
                setStatus("loading");
                suggestPlacesAction(tripId).then((r) =>
                  r.ok ? (setStatus("idle"), router.refresh()) : setStatus("failed"),
                );
              }}
              className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white"
            >
              Try again
            </button>
          }
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((c) => {
          const km =
            c.lat != null && c.lng != null
              ? haversineKm(base, { lat: c.lat, lng: c.lng })
              : null;
          const voted = c.votes.includes(currentUserId);
          const allergyHits = c.tags.filter((t) => allergies.includes(t));
          const hardFor = limited.length && c.tags.includes("strenuous");
          return (
            <div
              key={c.id}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-poppins text-sm font-semibold">
                      {c.name}
                    </span>
                    {c.rating != null && (
                      <span className="flex items-center gap-0.5 font-mono text-[11px] text-ink-3">
                        <Star className="size-3 fill-sun text-sun" />
                        {c.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="line-clamp-2 text-xs text-ink-2">{c.description}</div>
                </div>
                <button
                  onClick={() => startTransition(() => toggleVote(tripId, c.id))}
                  disabled={pending}
                  aria-label={voted ? "Remove vote" : "Vote"}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-xs transition",
                    voted
                      ? "border-sea bg-sea-soft text-sea"
                      : "border-line text-ink-3 hover:border-sea hover:text-sea",
                  )}
                >
                  <Heart className={cn("size-3.5", voted && "fill-sea")} />
                  {c.votes.length}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Chip>{c.category}</Chip>
                <Chip>{fmtDur(c.durationMin)}</Chip>
                {km != null && <Chip variant="sea">{km.toFixed(0)} km from {base.from.split(" ")[0].toLowerCase()}</Chip>}
                {c.priceLevel && <Chip>{"₹".repeat(c.priceLevel)}</Chip>}
                {hardFor ? (
                  <Chip variant="mango">
                    hard for {limited.map((p) => p.name).join(" & ")}
                  </Chip>
                ) : null}
                {allergyHits.map((a) => (
                  <Chip key={a} variant="mango">
                    contains {a}
                  </Chip>
                ))}
                {c.scheduled && <Chip variant="ok">scheduled</Chip>}
              </div>

              <div className="mt-auto flex items-center gap-1.5">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${c.name} ${destination}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-line p-1.5 text-ink-3 hover:text-sea"
                  aria-label={`Search ${c.name}`}
                >
                  <ExternalLink className="size-4" />
                </a>
                <a
                  href={mapsUrl(c.lat, c.lng, c.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-line p-1.5 text-ink-3 hover:text-sea"
                  aria-label={`Map for ${c.name}`}
                >
                  <MapPin className="size-4" />
                </a>
                {addingId === c.id ? (
                  <select
                    autoFocus
                    aria-label="Pick a day"
                    defaultValue=""
                    onChange={(e) => {
                      const date = e.target.value;
                      setAddingId(null);
                      if (date)
                        startTransition(async () => {
                          await addCandidateToDay(tripId, c.id, date);
                          router.refresh();
                        });
                    }}
                    onBlur={() => setAddingId(null)}
                    className="ml-auto rounded-lg border border-sea bg-surface px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="" disabled>
                      which day?
                    </option>
                    {dates.map((d, i) => (
                      <option key={d} value={d}>
                        Day {i + 1} · {format(parseISO(d), "EEE d")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setAddingId(c.id)}
                    disabled={pending}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-poppins text-xs font-semibold text-ink-2 hover:border-sea hover:text-sea"
                  >
                    <CalendarPlus className="size-3.5" /> Add to a day
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

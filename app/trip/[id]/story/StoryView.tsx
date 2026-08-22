"use client";

import { useState, useTransition } from "react";
import { Check, FileText, Link2, Play, RotateCcw, X } from "lucide-react";
import { TripStory, type StoryDay, type StoryStats } from "@/components/TripStory";
import { cn } from "@/lib/utils";
import { setShareLevel } from "./actions";

export function StoryView({
  tripId,
  title,
  destination,
  mode,
  days,
  stats,
  shareId,
  shareLevel,
}: {
  tripId: string;
  title: string;
  destination: string;
  mode: "plan" | "memories";
  days: StoryDay[];
  stats: StoryStats;
  shareId: string | null;
  shareLevel: "itinerary" | "everything";
}) {
  const [playKey, setPlayKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [level, setLevel] = useState(shareLevel);
  const [, startTransition] = useTransition();

  function copyLink() {
    if (!shareId) return;
    navigator.clipboard
      .writeText(`${window.location.origin}/t/${shareId}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setFullscreen(true);
            setPlayKey((k) => k + 1);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-sea px-4 py-2.5 font-poppins text-sm font-semibold text-white hover:opacity-90"
        >
          <Play className="size-4" /> Watch
        </button>
        <button
          onClick={() => setPlayKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
        >
          <RotateCcw className="size-4" /> Replay
        </button>
        <a
          href={`/trip/${tripId}/print`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
        >
          <FileText className="size-4" /> Full itinerary PDF
        </a>
        {shareId && (
          <div className="ml-auto flex items-center gap-2">
            <select
              value={level}
              aria-label="What the link shows"
              onChange={(e) => {
                const v = e.target.value as "itinerary" | "everything";
                setLevel(v);
                startTransition(() => setShareLevel(tripId, v));
              }}
              className="rounded-xl border border-line bg-surface px-2 py-2 text-xs outline-none"
            >
              <option value="itinerary">Link shows: itinerary only</option>
              <option value="everything">Link shows: everything (PNRs too)</option>
            </select>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
            >
              {copied ? <Check className="size-4 text-ok" /> : <Link2 className="size-4" />}
              {copied ? "Copied" : "Share link"}
            </button>
          </div>
        )}
      </div>

      {/* inline story */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <TripStory
          key={playKey}
          mode={mode}
          title={title}
          destination={destination}
          days={days}
          stats={stats}
        />
      </div>

      {/* fullscreen overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink p-6 sm:p-10">
          <div className="mx-auto max-w-lg">
            <div className="mb-4 flex justify-end gap-2">
              <button
                onClick={() => setPlayKey((k) => k + 1)}
                aria-label="Replay"
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <RotateCcw className="size-5" />
              </button>
              <button
                onClick={() => setFullscreen(false)}
                aria-label="Close"
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <X className="size-5" />
              </button>
            </div>
            <TripStory
              key={`fs-${playKey}`}
              mode={mode}
              title={title}
              destination={destination}
              days={days}
              stats={stats}
              dark
            />
          </div>
        </div>
      )}

    </div>
  );
}

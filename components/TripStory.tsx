"use client";

// One component, two modes. mode="plan" animates the route before the trip;
// mode="memories" replays it with real photos after. Each day card is themed
// from what that day actually contains (lib/imagery.ts). CSS + SVG only —
// nothing that can fail on stage.

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Chip } from "./Chip";
import { cn } from "@/lib/utils";

export interface StoryDay {
  date: string;
  dayLabel: string;          // "Mon 7"
  highlights: string[];
  weather?: string | null;
  photos: string[];
  photo: string;             // curated from the day's own activities
  tint: string;
}

export interface StoryStats {
  days: number;
  places: number;
  km: number;
  photos: number;
}

const STEP = 0.7;

export function TripStory({
  mode,
  title,
  destination,
  days,
  stats,
  dark = false,
}: {
  mode: "plan" | "memories";
  title: string;
  destination: string;
  days: StoryDay[];
  stats: StoryStats;
  dark?: boolean;
}) {
  const totalDur = days.length * STEP;

  return (
    <div className={cn(dark ? "text-white" : "text-ink")}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 text-center"
      >
        <h2 className="font-poppins text-2xl font-bold tracking-tight">{title}</h2>
        <div
          className={cn(
            "font-mono text-xs uppercase tracking-widest",
            dark ? "text-white/60" : "text-ink-3",
          )}
        >
          {destination} · {mode === "plan" ? "the plan" : "the memories"}
        </div>
      </motion.div>

      <div className="relative">
        {/* the thread that ties the days together, drawing itself downward */}
        <motion.div
          aria-hidden
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: totalDur, ease: "linear" }}
          style={{ transformOrigin: "top" }}
          className="absolute left-[1.4rem] top-6 h-[calc(100%-3rem)] w-0.5 rounded-full bg-sea/60"
        />

        <div className="space-y-4">
          {days.map((day, i) => (
            <div key={day.date} className="relative flex gap-4">
              {/* day node on the thread */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * STEP, type: "spring", stiffness: 320, damping: 18 }}
                className="relative z-10 mt-6 flex size-12 shrink-0 flex-col items-center justify-center rounded-full bg-sea font-poppins text-white shadow-lg ring-4 ring-surface"
              >
                <span className="text-[9px] font-medium uppercase leading-none opacity-80">
                  day
                </span>
                <span className="text-base font-bold leading-tight">{i + 1}</span>
              </motion.div>

              {/* the day itself — a photographic card themed by its activities */}
              <motion.div
                initial={{ opacity: 0, x: 28, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: i * STEP + 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="relative min-h-[8.5rem] flex-1 overflow-hidden rounded-2xl shadow-md"
              >
                <motion.div
                  initial={{ scale: 1.18 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * STEP + 0.1, duration: 2.4, ease: "easeOut" }}
                  className="absolute inset-0"
                >
                  <Image
                    src={day.photo}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover"
                  />
                </motion.div>
                {/* colour wash keyed to the day, plus a floor for the text */}
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-55", day.tint)} />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />

                <div className="relative flex h-full flex-col justify-end p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-white/70">
                      {day.dayLabel}
                    </span>
                    {day.weather && (
                      <Chip className="bg-white/20 text-white">{day.weather}</Chip>
                    )}
                  </div>
                  <div className="mt-1 font-poppins text-lg font-bold leading-tight tracking-tight text-white">
                    {day.highlights[0] ?? "A free day"}
                  </div>
                  {day.highlights.length > 1 && (
                    <div className="mt-0.5 text-sm text-white/85">
                      then {day.highlights.slice(1).join(" · ")}
                    </div>
                  )}
                  {mode === "memories" && day.photos.length > 0 && (
                    <div className="mt-2.5 flex gap-1.5">
                      {day.photos.slice(0, 5).map((p) => (
                        <motion.span
                          key={p}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * STEP + 0.5 }}
                          className="relative size-11 overflow-hidden rounded-lg ring-2 ring-white/30"
                        >
                          <Image src={p} alt="" fill sizes="44px" className="object-cover" />
                        </motion.span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>

      {/* the stats count up at the end */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: totalDur + 0.2, duration: 0.5 }}
        className={cn(
          "mt-5 grid grid-cols-4 gap-2 rounded-2xl border p-4 text-center",
          dark ? "border-white/15 bg-white/5" : "border-line bg-surface",
        )}
      >
        <Stat label="days" value={stats.days} delay={totalDur + 0.3} dark={dark} />
        <Stat label="places" value={stats.places} delay={totalDur + 0.45} dark={dark} />
        <Stat label="km" value={stats.km} delay={totalDur + 0.6} dark={dark} />
        <Stat label="photos" value={stats.photos} delay={totalDur + 0.75} dark={dark} />
      </motion.div>
    </div>
  );
}

function Stat({
  label,
  value,
  delay,
  dark,
}: {
  label: string;
  value: number;
  delay: number;
  dark: boolean;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now() + delay * 1000;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 900));
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);
  return (
    <div>
      <div className="font-mono text-2xl font-bold tabular-nums">{v}</div>
      <div
        className={cn(
          "font-mono text-[11px] uppercase tracking-wide",
          dark ? "text-white/60" : "text-ink-3",
        )}
      >
        {label}
      </div>
    </div>
  );
}

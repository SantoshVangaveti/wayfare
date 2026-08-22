"use client";

// One component, two modes. mode="plan" animates the route before the trip;
// mode="memories" replays it with real photos after. CSS + SVG only — nothing
// that can fail on stage.

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
}

export interface StoryStats {
  days: number;
  places: number;
  km: number;
  photos: number;
}

const NODE_H = 132;
const X = 28;

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
  const totalDur = days.length * 0.55;
  const height = days.length * NODE_H + 40;

  const x = (i: number) => X + (i % 2 ? 18 : 0);
  const y = (i: number) => 30 + i * NODE_H;
  let d = `M ${x(0)} ${y(0)}`;
  for (let i = 1; i < days.length; i++) {
    d += ` C ${x(i - 1) + 34} ${y(i - 1) + NODE_H / 2}, ${x(i) - 34} ${y(i) - NODE_H / 2}, ${x(i)} ${y(i)}`;
  }

  return (
    <div className={cn(dark ? "text-white" : "text-ink")}>
      <div className="mb-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-poppins text-xl font-bold tracking-tight"
        >
          {title}
        </motion.h2>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={cn("font-mono text-xs", dark ? "text-white/60" : "text-ink-3")}
        >
          {destination} · {mode === "plan" ? "the plan" : "the memories"}
        </motion.div>
      </div>

      <div className="relative" style={{ height }}>
        {/* the route draws itself */}
        <svg
          className="absolute left-0 top-0 h-full"
          width="90"
          viewBox={`0 0 90 ${height}`}
          fill="none"
          aria-hidden
        >
          <motion.path
            d={d}
            stroke="var(--color-sea)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: totalDur, ease: "linear" }}
          />
        </svg>

        {days.map((day, i) => (
          <div key={day.date}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.55, duration: 0.25 }}
              className="absolute z-10 flex size-5 items-center justify-center rounded-full bg-sea font-poppins text-[9px] font-bold text-white"
              style={{ left: x(i) - 10, top: y(i) - 10 }}
            >
              {i + 1}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.55 + 0.12, duration: 0.4 }}
              className={cn(
                "absolute left-[86px] right-0 rounded-xl border p-3",
                dark
                  ? "border-white/15 bg-white/5"
                  : "border-line bg-surface shadow-sm",
              )}
              style={{ top: y(i) - 18 }}
            >
              <div className="flex items-center gap-2">
                <span className="font-poppins text-sm font-semibold">
                  Day {i + 1}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    dark ? "text-white/60" : "text-ink-3",
                  )}
                >
                  {day.dayLabel}
                </span>
                {day.weather && (
                  <Chip variant="sea" className="ml-auto">
                    {day.weather}
                  </Chip>
                )}
              </div>
              <div
                className={cn(
                  "mt-1 line-clamp-2 text-sm",
                  dark ? "text-white/80" : "text-ink-2",
                )}
              >
                {day.highlights.length ? day.highlights.join(" · ") : "a free day"}
              </div>
              {mode === "memories" && day.photos.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {day.photos.slice(0, 4).map((p) => (
                    <span
                      key={p}
                      className="relative size-12 overflow-hidden rounded-lg"
                    >
                      <Image src={p} alt="" fill sizes="48px" className="object-cover" />
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        ))}
      </div>

      {/* the stats count up at the end */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: totalDur + 0.2, duration: 0.4 }}
        className={cn(
          "mt-6 grid grid-cols-4 gap-2 rounded-2xl border p-4 text-center",
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

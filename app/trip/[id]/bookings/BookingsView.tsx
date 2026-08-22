"use client";

// We are not a booking engine. Real options, honest estimates, and every
// price LINKS OUT to a site with the dates pre-filled. "I booked it" loops
// the confirmation back through the Inbox.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BedDouble, Bus, Car, ExternalLink, Loader2, Plane, TrainFront,
} from "lucide-react";
import { directionsUrl } from "@/lib/maps";
import { Chip } from "@/components/Chip";
import { Companion } from "@/components/Companion";
import { cn } from "@/lib/utils";
import { suggestStaysAction, type StayResult } from "./actions";

const STAY_TYPES = ["homestay", "cabin", "hotel", "resort", "hostel"] as const;

type Status = "loading" | "ready" | "no-key" | "failed";

export function BookingsView({
  tripId,
  destination,
  currency,
  startDate,
  endDate,
  homeCity,
  home,
  dest,
  transportPrefs,
}: {
  tripId: string;
  destination: string;
  currency: string;
  startDate: string;
  endDate: string;
  homeCity: string | null;
  home: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number };
  transportPrefs: string[];
}) {
  const [types, setTypes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [stays, setStays] = useState<StayResult[]>([]);
  const ran = useRef(false);

  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  function load(selected: string[]) {
    setStatus("loading");
    suggestStaysAction(tripId, selected).then((res) => {
      if (res.ok) {
        setStays(res.stays);
        setStatus("ready");
      } else {
        setStatus(res.reason === "no-key" ? "no-key" : "failed");
      }
    });
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = types.length ? stays.filter((s) => types.includes(s.type)) : stays;

  const stayUrl = (s: StayResult) =>
    `https://www.google.com/travel/search?q=${encodeURIComponent(
      `${s.name} ${destination}`,
    )}&checkin=${startDate}&checkout=${endDate}`;
  const bookingUrl = (s: StayResult) =>
    `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(
      `${s.name} ${destination}`,
    )}&checkin=${startDate}&checkout=${endDate}`;

  const from = homeCity ?? "home";
  const transport = [
    {
      key: "flight", icon: Plane, label: `Flights ${from} → ${destination.split(",")[0]}`,
      sub: `around ${startDate}`,
      url: `https://www.google.com/travel/flights?q=${encodeURIComponent(
        `flights from ${from} to ${destination} on ${startDate}`,
      )}`,
    },
    {
      key: "train", icon: TrainFront, label: `Trains from ${from}`,
      sub: "availability + booking",
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `trains from ${from} to ${destination} ${startDate}`,
      )}`,
    },
    {
      key: "bus", icon: Bus, label: `Buses from ${from}`,
      sub: "overnight + seater options",
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `bus from ${from} to ${destination}`,
      )}`,
    },
    {
      key: "road", icon: Car, label: "Drive it",
      sub: "route, tolls and timing",
      url: home ? directionsUrl(home, dest) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
    },
  ].filter(
    (t) =>
      transportPrefs.length === 0 ||
      transportPrefs.includes("any") ||
      transportPrefs.includes(t.key),
  );

  return (
    <div className="space-y-6">
      <Companion
        headline="This screen is skippable."
        message="Book anywhere you like — forward the confirmation to the Inbox and it lands in the plan. Without a booked stay, travel times are estimated from the town centre."
        actions={
          <Link
            href={`/trip/${tripId}/inbox`}
            className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white"
          >
            I booked it → Inbox
          </Link>
        }
      />

      {/* stay types */}
      <section className="space-y-2">
        <h2 className="font-poppins text-base font-bold tracking-tight">
          Somewhere to stay
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {STAY_TYPES.map((t) => {
            const on = types.includes(t);
            return (
              <button
                key={t}
                onClick={() =>
                  setTypes((prev) =>
                    on ? prev.filter((x) => x !== t) : [...prev, t],
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition",
                  on
                    ? "border-sea bg-sea-soft text-sea"
                    : "border-line bg-surface text-ink-2",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>

        {status === "loading" && (
          <div className="flex items-center gap-2 py-4 text-sm text-ink-2">
            <Loader2 className="size-4 animate-spin text-sea" />
            Finding real places to stay…
          </div>
        )}
        {status === "no-key" && (
          <p className="text-sm text-ink-2">
            Add an AI key in <Link href="/settings" className="text-sea underline">Settings</Link> and options appear here.
          </p>
        )}
        {status === "failed" && (
          <button onClick={() => load(types)} className="font-poppins text-xs font-semibold text-sea">
            Couldn't fetch options — try again
          </button>
        )}

        {status === "ready" &&
          visible.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              <BedDouble className="size-5 shrink-0 text-sea" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-poppins text-sm font-semibold">{s.name}</span>
                  <Chip>{s.type}</Chip>
                  <span className="font-mono text-[11px] text-ink-3">{s.area}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-2">{s.whyFit}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-mono text-sm font-semibold">
                  ~{money.format(s.estPerNight)}
                  <span className="text-[10px] font-normal text-ink-3">/night</span>
                </span>
                <div className="flex gap-1.5">
                  <a
                    href={stayUrl(s)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line px-2 py-1 font-poppins text-[11px] font-semibold text-ink-2 hover:border-sea hover:text-sea"
                  >
                    Google
                  </a>
                  <a
                    href={bookingUrl(s)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line px-2 py-1 font-poppins text-[11px] font-semibold text-ink-2 hover:border-sea hover:text-sea"
                  >
                    Booking.com
                  </a>
                </div>
              </div>
            </div>
          ))}
        {status === "ready" && visible.length === 0 && (
          <p className="text-sm text-ink-3">Nothing of that type — clear a filter.</p>
        )}
      </section>

      {/* transport link-outs */}
      <section className="space-y-2">
        <h2 className="font-poppins text-base font-bold tracking-tight">
          Getting there
        </h2>
        {transport.map((t) => (
          <a
            key={t.key}
            href={t.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-sea"
          >
            <t.icon className="size-5 shrink-0 text-sea" />
            <div className="min-w-0 flex-1">
              <div className="font-poppins text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-ink-3">{t.sub}</div>
            </div>
            <ExternalLink className="size-4 shrink-0 text-ink-3" />
          </a>
        ))}
      </section>
    </div>
  );
}

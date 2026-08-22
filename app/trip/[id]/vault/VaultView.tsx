"use client";

// Every confirmation number, phone, address, deadline and wifi credential in
// the trip, grouped by day. Tap-to-call, tap-to-copy, tap-to-map. Printable.

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Check, Copy, MapPin, Phone, Printer, Plus, Search } from "lucide-react";
import { mapsUrl, telUrl } from "@/lib/maps";
import { Chip } from "@/components/Chip";
import { cn } from "@/lib/utils";

export interface VaultEntry {
  blockId: string;
  date: string;
  startTime: string | null;
  title: string;
  type: string;
  lat: number | null;
  lng: number | null;
  placeName: string | null;
  fields: [string, string][];
}

const LABELS: Record<string, string> = {
  confirmationNumber: "Confirmation",
  phone: "Phone",
  address: "Address",
  checkIn: "Check-in",
  checkOut: "Check-out",
  cancelBy: "Free cancellation until",
  flightNumber: "Flight",
  terminal: "Terminal",
  gate: "Gate",
  seat: "Seat",
  seats: "Seats",
  hostName: "Host",
  wifi: "Wi-Fi",
  airline: "Airline",
  notes: "Notes",
  includedMeals: "Included meals",
};

const URGENT_MS = 72 * 60 * 60 * 1000;

export function VaultView({
  tripId,
  entries,
}: {
  tripId: string;
  entries: VaultEntry[];
}) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(needle) ||
        e.fields.some(
          ([k, v]) =>
            k.toLowerCase().includes(needle) || v.toLowerCase().includes(needle),
        ),
    );
  }, [entries, q]);

  const byDate = useMemo(() => {
    const m = new Map<string, VaultEntry[]>();
    for (const e of filtered) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    });
  }

  const isUrgent = (k: string, v: string) => {
    if (k !== "cancelBy") return false;
    const t = new Date(`${v}T23:59:59`).getTime() - Date.now();
    return t > 0 && t < URGENT_MS;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search anything — a code, a name, wifi…"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sea"
          />
        </div>
        <Link
          href={`/trip/${tripId}/inbox`}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
        >
          <Plus className="size-4" /> Add anything
        </Link>
        <a
          href={`/trip/${tripId}/print`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
        >
          <Printer className="size-4" /> Whole trip as PDF
        </a>
      </div>

      {byDate.length === 0 && (
        <p className="text-sm text-ink-3">Nothing matches “{q}”.</p>
      )}

      {byDate.map(([date, list]) => (
        <section key={date} className="space-y-2 break-inside-avoid">
          <h2 className="font-poppins text-sm font-bold tracking-tight text-ink-2">
            {format(parseISO(date), "EEEE d MMMM")}
          </h2>
          {list.map((e) => (
            <div
              key={e.blockId}
              className="rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-3">{e.startTime ?? "—"}</span>
                <span className="font-poppins text-sm font-semibold">{e.title}</span>
                <Chip className="ml-auto">{e.type}</Chip>
              </div>
              <dl className="mt-3 space-y-1.5">
                {e.fields.map(([k, v]) => {
                  const urgent = isUrgent(k, v);
                  const copyKey = `${e.blockId}:${k}`;
                  const isPhone = k.toLowerCase().includes("phone");
                  const isAddress = k === "address";
                  return (
                    <div
                      key={k}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1",
                        urgent && "bg-mango-soft",
                      )}
                    >
                      <dt
                        className={cn(
                          "w-40 shrink-0 font-mono text-[11px] uppercase tracking-wide",
                          urgent ? "text-mango" : "text-ink-3",
                        )}
                      >
                        {LABELS[k] ?? k}
                      </dt>
                      <dd
                        className={cn(
                          "min-w-0 flex-1 truncate font-mono text-sm",
                          urgent ? "font-semibold text-mango" : "text-ink",
                        )}
                      >
                        {v}
                      </dd>
                      <div className="flex shrink-0 gap-1 print:hidden">
                        {isPhone && (
                          <a
                            href={telUrl(v)}
                            aria-label={`Call ${v}`}
                            className="rounded-md p-1 text-sea hover:bg-sea-soft"
                          >
                            <Phone className="size-3.5" />
                          </a>
                        )}
                        {isAddress && e.lat != null && e.lng != null && (
                          <a
                            href={mapsUrl(e.lat, e.lng, v)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open in maps"
                            className="rounded-md p-1 text-sea hover:bg-sea-soft"
                          >
                            <MapPin className="size-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => copy(copyKey, v)}
                          aria-label={`Copy ${LABELS[k] ?? k}`}
                          className="rounded-md p-1 text-ink-3 hover:bg-paper-2 hover:text-ink"
                        >
                          {copied === copyKey ? (
                            <Check className="size-3.5 text-ok" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bus, Car, MapPin, Loader2, Plane, Ship, Sparkles, TrainFront, Trash2,
} from "lucide-react";
import { detectLocation, searchPlaces, type Place } from "@/lib/location";
import type { Traveller } from "@/lib/types";
import { defaultFunnel, loadFunnel, saveFunnel, type FunnelState } from "@/lib/funnel";
import { themeForInterests } from "@/lib/imagery";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { cn } from "@/lib/utils";

const TRANSPORT = [
  { key: "flight", label: "Flight", icon: Plane },
  { key: "train", label: "Train", icon: TrainFront },
  { key: "road", label: "Road trip", icon: Car },
  { key: "ferry", label: "Ferry", icon: Ship },
  { key: "bus", label: "Bus", icon: Bus },
  { key: "any", label: "Any", icon: Sparkles },
];
const LAND = new Set(["train", "road", "bus"]);
const DIETS = ["veg", "vegan", "jain", "halal", "nonveg"];

type LocState = "idle" | "finding" | "resolved" | "refused";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-poppins text-sm font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function DetailsPage() {
  const router = useRouter();
  const [s, setS] = useState<FunnelState | null>(null);
  const [locState, setLocState] = useState<LocState>("idle");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const f = loadFunnel() ?? defaultFunnel();
    setS(f);
    if (f.home) setLocState("resolved");
  }, []);
  if (!s) return null;
  const set = (patch: Partial<FunnelState>) => setS((p) => ({ ...p!, ...patch }));

  // NEVER on mount — only from this click handler.
  function useMyLocation() {
    setLocState("finding");
    detectLocation()
      .then((place) => {
        set({ home: place });
        setLocState("resolved");
      })
      .catch(() => {
        // A refused permission is a normal choice, not an error.
        setLocState("refused");
        setTimeout(() => inputRef.current?.focus(), 0);
      });
  }

  function onQuery(v: string) {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSuggestions(await searchPlaces(v));
    }, 300);
  }

  const addTraveller = (kind: Traveller["kind"]) =>
    set({
      party: [
        ...s.party,
        {
          name: `${kind === "kid" ? "Kid" : kind === "senior" ? "Senior" : "Traveller"} ${s.party.length + 1}`,
          kind,
          age: kind === "kid" ? 8 : kind === "senior" ? 68 : undefined,
        },
      ],
    });

  const patchTraveller = (i: number, patch: Partial<Traveller>) =>
    set({ party: s.party.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const international = s.scope === "international";
  const transportOptions = TRANSPORT.filter(
    (t) => !(international && LAND.has(t.key)),
  );

  const valid =
    s.party.length > 0 && s.startDate && s.endDate && s.startDate <= s.endDate;

  function next() {
    saveFunnel(s!);
    router.push("/plan/destinations");
  }

  return (
    <>
      <AmbientBackdrop photo={themeForInterests(s.interests)} />
      <div className="relative z-10 space-y-7">
      <h1 className="font-poppins text-2xl font-bold tracking-tight">The details</h1>

      <Section title="How far from home?">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface">
          {(["domestic", "international", "either"] as const).map((v) => (
            <button
              key={v}
              onClick={() => set({ scope: v })}
              className={cn(
                "py-2.5 font-poppins text-xs font-semibold capitalize transition",
                s.scope === v ? "bg-sea text-white" : "text-ink-2 hover:bg-paper-2",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </Section>

      <Section title="One place, or a few?">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => set({ multiCity: v })}
              className={cn(
                "px-3 py-2.5 font-poppins text-xs font-semibold transition",
                s.multiCity === v ? "bg-sea text-white" : "text-ink-2 hover:bg-paper-2",
              )}
            >
              {v ? "A route across several places" : "One place"}
            </button>
          ))}
        </div>
        {s.multiCity && (
          <p className="text-xs text-ink-2">
            We'll suggest ordered routes and split your dates between the stops.
          </p>
        )}
      </Section>

      <Section title="Who's travelling?">
        <div className="flex gap-2">
          {(["adult", "kid", "senior"] as const).map((k) => (
            <button
              key={k}
              onClick={() => addTraveller(k)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 font-poppins text-xs font-semibold text-ink-2 hover:border-sea hover:text-sea"
            >
              + {k}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {s.party.map((t, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5"
            >
              <span className="rounded-full bg-paper-2 px-2 py-1 font-mono text-[10px] uppercase">
                {t.kind}
              </span>
              <input
                value={t.name}
                onChange={(e) => patchTraveller(i, { name: e.target.value })}
                aria-label="Name"
                className="w-28 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:border-sea focus:bg-paper"
              />
              <input
                value={t.age ?? ""}
                onChange={(e) =>
                  patchTraveller(i, { age: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="age"
                inputMode="numeric"
                aria-label="Age"
                className="w-14 rounded-lg border border-line bg-paper px-2 py-1 font-mono text-sm outline-none focus:border-sea"
              />
              <label className="flex items-center gap-1.5 text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={t.mobility === "limited"}
                  onChange={(e) =>
                    patchTraveller(i, { mobility: e.target.checked ? "limited" : "full" })
                  }
                  className="accent-[#0C7C86]"
                />
                limited mobility
              </label>
              <input
                value={(t.health ?? []).join(", ")}
                onChange={(e) =>
                  patchTraveller(i, {
                    health: e.target.value
                      .split(",")
                      .map((x) => x.trim().toLowerCase())
                      .filter(Boolean),
                  })
                }
                placeholder="health notes (knee, asthma…)"
                aria-label="Health notes"
                className="min-w-32 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none focus:border-sea"
              />
              <button
                onClick={() => set({ party: s.party.filter((_, j) => j !== i) })}
                aria-label="Remove traveller"
                className="rounded-lg p-1.5 text-ink-3 hover:bg-paper-2 hover:text-mango"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Starting from">
        {locState === "resolved" && s.home ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
            <MapPin className="size-4 text-sea" />
            <span>
              {s.home.name}
              {s.home.region ? `, ${s.home.region}` : ""}
            </span>
            <button
              onClick={() => {
                set({ home: null });
                setLocState("idle");
                setQuery("");
              }}
              className="ml-auto font-poppins text-xs font-semibold text-sea"
            >
              Not right? Change
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {locState === "finding" ? (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-2">
                <Loader2 className="size-4 animate-spin text-sea" /> Finding you…
              </div>
            ) : (
              <button
                onClick={useMyLocation}
                className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-2 hover:border-sea hover:text-sea"
              >
                <MapPin className="size-4" /> Use my current location
              </button>
            )}
            {locState === "refused" && (
              <p className="text-sm text-ink-2">
                Couldn't get your location — no problem, type it below.
              </p>
            )}
            <div className="relative">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Start typing a city…"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-sea"
              />
              {suggestions.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  {suggestions.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        set({ home: p });
                        setLocState("resolved");
                        setSuggestions([]);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-2"
                    >
                      <MapPin className="size-3.5 text-ink-3" />
                      {p.name}
                      {p.region ? `, ${p.region}` : ""} · {p.country}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title="When?">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={s.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
            aria-label="Start date"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:border-sea"
          />
          <span className="text-ink-3">→</span>
          <input
            type="date"
            value={s.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
            aria-label="End date"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:border-sea"
          />
        </div>
      </Section>

      <Section title="How do you like to travel?">
        <div className="grid grid-cols-3 gap-2">
          {transportOptions.map((t) => {
            const on = s.transport.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() =>
                  set({
                    transport: on
                      ? s.transport.filter((x) => x !== t.key)
                      : [...s.transport, t.key],
                  })
                }
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition",
                  on
                    ? "border-sea bg-sea-soft text-sea"
                    : "border-line bg-surface text-ink-2 hover:border-line-2",
                )}
              >
                <t.icon className="size-5" />
                <span className="font-poppins text-xs font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Budget per day">
        <div className="flex gap-2">
          <input
            value={s.budgetPerDay ?? ""}
            onChange={(e) =>
              set({ budgetPerDay: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })
            }
            placeholder={s.budgetPerDay === null ? "no limit" : "₹ per day"}
            inputMode="numeric"
            aria-label="Budget per day"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:border-sea"
          />
          <button
            onClick={() => set({ budgetPerDay: null })}
            className={cn(
              "rounded-xl border px-4 font-poppins text-xs font-semibold transition",
              s.budgetPerDay === null
                ? "border-sun bg-sun-soft text-ink"
                : "border-line bg-surface text-ink-2 hover:border-sun",
            )}
          >
            Go wild
          </button>
        </div>
      </Section>

      <Section title="Diet + allergies">
        <div className="flex flex-wrap gap-1.5">
          {DIETS.map((d) => {
            const on = s.diet.includes(d);
            return (
              <button
                key={d}
                onClick={() =>
                  set({ diet: on ? s.diet.filter((x) => x !== d) : [...s.diet, d] })
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition",
                  on
                    ? "border-sea bg-sea-soft text-sea"
                    : "border-line bg-surface text-ink-2",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
        <input
          value={s.allergies}
          onChange={(e) => set({ allergies: e.target.value })}
          placeholder="allergies — nuts, shellfish…"
          aria-label="Allergies"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-sea"
        />
      </Section>

      <button
        onClick={next}
        disabled={!valid}
        className="w-full rounded-xl bg-sea px-4 py-3 font-poppins text-sm font-semibold text-white disabled:opacity-40"
      >
        Find places
      </button>
      </div>
    </>
  );
}

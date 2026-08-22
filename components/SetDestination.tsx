"use client";

// An imported trip often can't be located from its bookings — a hotel name
// isn't on the map and "Goa" matches a town in the Philippines. Rather than
// guess and quietly relocate the trip, ask once, in one line.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { searchPlaces, type Place } from "@/lib/location";
import { setTripDestination } from "@/app/actions";

export function SetDestination({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  function onQuery(v: string) {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setHits(await searchPlaces(v));
    }, 300);
  }

  return (
    <div className="rounded-2xl border border-sun/40 bg-sun-soft p-4">
      <div className="font-poppins text-sm font-semibold text-ink">
        Where is this trip?
      </div>
      <p className="mt-0.5 text-sm text-ink-2">
        Tell me the town and I can suggest real places nearby, check your drive
        times, and build the empty days around what you've booked.
      </p>
      <div className="relative mt-2">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Start typing a town…"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-sea"
        />
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
            {hits.map((p, i) => (
              <button
                key={i}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await setTripDestination(tripId, p);
                    setHits([]);
                    router.refresh();
                  })
                }
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
  );
}

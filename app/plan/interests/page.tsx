"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { PhotoChoiceCard } from "@/components/PhotoChoiceCard";
import { themeForInterests } from "@/lib/imagery";
import { defaultFunnel, loadFunnel, saveFunnel, type FunnelState } from "@/lib/funnel";

const INTERESTS = [
  { key: "mountains", label: "Mountains", desc: "Hills, mist, viewpoints",
    img: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=70" },
  { key: "beaches", label: "Beaches", desc: "Sand, surf, sunsets",
    img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=70" },
  { key: "city", label: "City life", desc: "Streets, nightlife, people",
    img: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&q=70" },
  { key: "nature", label: "Nature", desc: "Forests, wildlife, quiet",
    img: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800&q=70" },
  { key: "food", label: "Food", desc: "Markets, kitchens, thalis",
    img: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=70" },
  { key: "heritage", label: "Heritage", desc: "Temples, forts, old towns",
    img: "https://images.unsplash.com/photo-1548013146-72479768bada?w=800&q=70" },
];

export default function InterestsPage() {
  const router = useRouter();
  const [state, setState] = useState<FunnelState | null>(null);

  useEffect(() => {
    setState(loadFunnel() ?? defaultFunnel());
  }, []);
  if (!state) return null;

  const toggle = (key: string) =>
    setState((s) => ({
      ...s!,
      interests: s!.interests.includes(key)
        ? s!.interests.filter((x) => x !== key)
        : [...s!.interests, key],
    }));

  function next() {
    saveFunnel(state!);
    router.push("/plan/details");
  }

  return (
    <div className="relative z-10 space-y-6">
      {/* the page dresses itself in whatever they've picked so far */}
      <AmbientBackdrop photo={themeForInterests(state.interests)} />
      <h1 className="font-poppins text-2xl font-bold tracking-tight">
        What sounds good?
      </h1>

      <div className="grid grid-cols-2 gap-3">
        {INTERESTS.map((it) => (
          <PhotoChoiceCard
            key={it.key}
            image={it.img}
            label={it.label}
            description={it.desc}
            selected={state.interests.includes(it.key)}
            onSelect={() => toggle(it.key)}
          />
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-ink-2" htmlFor="freetext">
          Anything else we should know?{" "}
          <span className="text-ink-3">(optional, but it makes all the difference)</span>
        </label>
        <textarea
          id="freetext"
          value={state.freeText}
          onChange={(e) => setState((s) => ({ ...s!, freeText: e.target.value }))}
          rows={3}
          placeholder="First trip since Dad's surgery. Somewhere green and calm — Amma is 68 and the kids are 7 and 11."
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-sea"
        />
      </div>

      <button
        onClick={next}
        disabled={state.interests.length === 0}
        className="w-full rounded-xl bg-sea px-4 py-3 font-poppins text-sm font-semibold text-white disabled:opacity-40"
      >
        Continue
      </button>
    </div>
  );
}

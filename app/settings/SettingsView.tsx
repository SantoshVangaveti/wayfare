"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { Chip } from "@/components/Chip";
import { cn } from "@/lib/utils";
import { removeKey, saveSettings } from "./actions";

export interface UsageSummary {
  liveCalls: number;
  cachedCalls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  byFeature: { feature: string; calls: number; cached: number }[];
}

const DAILY_CAPS: Partial<Record<ProviderId, number>> = { google: 1500 };

export function SettingsView({
  provider: initialProvider,
  model: initialModel,
  apiKeyHint,
  usage,
}: {
  provider: ProviderId;
  model: string;
  apiKeyHint: string | null;
  usage: UsageSummary;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderId>(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const p = PROVIDERS[provider];
  const cap = DAILY_CAPS[provider];
  const pct = cap ? Math.min(100, (usage.liveCalls / cap) * 100) : 0;
  const nearCap = cap ? usage.liveCalls >= cap * 0.8 : false;
  const total = usage.liveCalls + usage.cachedCalls;
  const hitRate = total ? Math.round((usage.cachedCalls / total) * 100) : 0;

  const R = 34;
  const CIRC = 2 * Math.PI * R;

  function save() {
    setResult(null);
    startTransition(async () => {
      const res = await saveSettings(provider, model, key || undefined);
      if (res.ok) {
        setResult({ ok: true, msg: "Connected and saved." });
        setKey("");
        router.refresh();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-poppins text-2xl font-bold tracking-tight">Settings</h1>

      {/* provider + model + key */}
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-poppins text-sm font-bold tracking-tight">AI provider</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-3">
              Provider
            </span>
            <select
              value={provider}
              onChange={(e) => {
                const id = e.target.value as ProviderId;
                setProvider(id);
                setModel(PROVIDERS[id].models[0].id);
              }}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-sea"
            >
              {Object.entries(PROVIDERS).map(([id, prov]) => (
                <option key={id} value={id}>
                  {prov.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-3">
              Model
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-sea"
            >
              {p.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.models
            .filter((m) => m.free)
            .map((m) => (
              <Chip key={m.id} variant="ok">
                {m.id} · free
              </Chip>
            ))}
        </div>
        <div>
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-3">
            API key
          </span>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={apiKeyHint ?? `${p.keyPrefix}…`}
                className="w-full rounded-xl border border-line bg-paper py-2.5 pl-9 pr-3 font-mono text-sm outline-none focus:border-sea"
              />
            </div>
            <button
              onClick={save}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xl bg-sea px-4 py-2.5 font-poppins text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Test & Save
            </button>
            {apiKeyHint && (
              <button
                onClick={() => startTransition(async () => {
                  await removeKey();
                  setResult(null);
                  router.refresh();
                })}
                aria-label="Remove key"
                className="rounded-xl border border-line px-3 text-ink-3 hover:text-mango"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            Get a key at{" "}
            <a href={p.keyUrl} target="_blank" rel="noreferrer" className="text-sea underline">
              {p.keyUrl.replace("https://", "")}
            </a>
            . Stored encrypted in the database — never in a file.
          </p>
          {result && (
            <p className={cn("mt-2 text-sm", result.ok ? "text-ok" : "text-mango")}>
              {result.msg}
            </p>
          )}
        </div>
      </section>

      {/* usage meter */}
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-poppins text-sm font-bold tracking-tight">Usage today</h2>
        {nearCap && (
          <div className="rounded-xl border border-mango bg-mango-soft px-3 py-2 text-sm text-mango">
            {usage.liveCalls} of {cap} daily requests used — consider switching model.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative">
            <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
              <circle cx="44" cy="44" r={R} fill="none" stroke="var(--color-paper-2)" strokeWidth="8" />
              <circle
                cx="44" cy="44" r={R} fill="none"
                stroke={nearCap ? "var(--color-mango)" : "var(--color-sea)"}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - pct / 100)}
                transform="rotate(-90 44 44)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-lg font-bold">{usage.liveCalls}</span>
              <span className="font-mono text-[9px] uppercase text-ink-3">
                {cap ? `of ${cap}` : "calls"}
              </span>
            </div>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-ink-3">tokens in</dt>
              <dd className="font-semibold">{usage.inTokens.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-ink-3">tokens out</dt>
              <dd className="font-semibold">{usage.outTokens.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-ink-3">est. cost</dt>
              <dd className="font-semibold">${usage.costUsd.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-ink-3">cache hits</dt>
              <dd className="font-semibold">{hitRate}%</dd>
            </div>
          </dl>
        </div>
        {usage.byFeature.length > 0 && (
          <div className="space-y-1.5">
            {usage.byFeature.map((f) => (
              <div key={f.feature} className="flex items-center gap-2 text-sm">
                <span className="w-44 truncate font-mono text-xs text-ink-2">
                  {f.feature}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
                  <div
                    className="h-full rounded-full bg-sea"
                    style={{
                      width: `${(f.calls / usage.byFeature[0].calls) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-mono text-xs text-ink-3">
                  {f.calls}
                  {f.cached ? ` (${f.cached} cached)` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        {total === 0 && (
          <p className="text-sm text-ink-3">No AI calls yet today.</p>
        )}
      </section>
    </div>
  );
}

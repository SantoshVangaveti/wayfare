import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { DEFAULTS } from "@/lib/providers";
import { SettingsView, type UsageSummary } from "./SettingsView";

export const dynamic = "force-dynamic";

// rough $ per 1M tokens [in, out]; unknown/free models cost 0
const RATES: Record<string, [number, number]> = {
  "claude-sonnet-5": [3, 15],
  "claude-haiku-4-5": [1, 5],
};

export default async function SettingsPage() {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [settings, usage] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: dayStart } } }),
  ]);

  const byFeature = new Map<string, { calls: number; cached: number }>();
  let inTokens = 0;
  let outTokens = 0;
  let cost = 0;
  let liveCalls = 0;
  let cachedCalls = 0;
  for (const u of usage) {
    const f = byFeature.get(u.feature) ?? { calls: 0, cached: 0 };
    f.calls += 1;
    if (u.cached) {
      f.cached += 1;
      cachedCalls += 1;
    } else {
      liveCalls += 1;
    }
    byFeature.set(u.feature, f);
    inTokens += u.inTokens;
    outTokens += u.outTokens;
    const [rin, rout] = RATES[u.model] ?? [0, 0];
    cost += (u.inTokens / 1e6) * rin + (u.outTokens / 1e6) * rout;
  }

  const summary: UsageSummary = {
    liveCalls,
    cachedCalls,
    inTokens,
    outTokens,
    costUsd: Math.round(cost * 10000) / 10000,
    byFeature: [...byFeature.entries()]
      .map(([feature, v]) => ({ feature, ...v }))
      .sort((a, b) => b.calls - a.calls),
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 font-poppins text-lg font-bold tracking-tight text-sea"
      >
        <ArrowLeft className="size-4" /> Wayfare
      </Link>
      <SettingsView
        provider={(settings?.provider ?? DEFAULTS.provider) as never}
        model={settings?.model ?? DEFAULTS.model}
        apiKeyHint={settings?.apiKeyHint ?? null}
        usage={summary}
      />
    </div>
  );
}

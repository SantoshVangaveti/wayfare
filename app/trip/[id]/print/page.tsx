// The whole trip on paper — a keepsake, not a spreadsheet. Built to survive
// "Save as PDF" for someone who never opens the app: every day, every time,
// every confirmation number, phone and address, with the colour intact.

import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { prisma } from "@/lib/db";
import { analyseTrip, fmtDur } from "@/lib/feasibility";
import { toBlockLike } from "@/lib/blocks";
import { balances, settle } from "@/lib/settle";
import type { ExpenseLike, Party } from "@/lib/types";
import { PrintTrigger } from "./PrintTrigger";

export const dynamic = "force-dynamic";

type Meta = Record<string, string | number | string[] | null | undefined>;

const BLOCK_EMOJI: Record<string, string> = {
  FLIGHT: "✈️", TRAIN: "🚆", BUS: "🚌", FERRY: "⛴️", TRANSIT: "🚗",
  LODGING: "🏡", ACTIVITY: "🥾", MEAL: "🍛", NOTE: "📝",
};

const TAG_EMOJI: Record<string, string> = {
  outdoor: "🌤️", flat: "🚶", strenuous: "⛰️", "kid-friendly": "🧒",
  indoor: "🏛️", veg: "🥗", scenic: "📸", shopping: "🛍️", early: "🌅",
  ghat: "🛣️", knee: "🦵", nuts: "🥜", nostalgia: "📻",
};

const META_EMOJI: Record<string, string> = {
  confirmationNumber: "🎫", phone: "📞", address: "📍", checkIn: "🔑",
  checkOut: "👋", cancelBy: "⏳", flightNumber: "✈️", airline: "🛫",
  terminal: "🚏", gate: "🚪", seat: "💺", seats: "💺", hostName: "🧑‍🍳",
  wifi: "📶", includedMeals: "🍽️", notes: "📝",
};

const META_LABELS: Record<string, string> = {
  confirmationNumber: "Confirmation", phone: "Phone", address: "Address",
  checkIn: "Check-in", checkOut: "Check-out", cancelBy: "Free cancellation until",
  flightNumber: "Flight", airline: "Airline", terminal: "Terminal", gate: "Gate",
  seat: "Seat", seats: "Seats", hostName: "Host", wifi: "Wi-Fi",
  includedMeals: "Meals included", notes: "Notes",
};

// Each day gets its own colour so the printed pages stay cheerful.
const DAY_COLORS = [
  { bg: "#DCEFF1", ink: "#0C7C86" },
  { bg: "#FDF2DA", ink: "#B87A0A" },
  { bg: "#D6EFE7", ink: "#178A69" },
  { bg: "#FBE6D7", ink: "#D25E18" },
  { bg: "#E6EFF1", ink: "#3B5661" },
  { bg: "#DCEFF1", ink: "#0C7C86" },
];

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
      members: { include: { user: true } },
      expenses: { include: { payer: true } },
    },
  });
  if (!trip) notFound();

  const party = trip.party as unknown as Party;
  const money = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: trip.currency, maximumFractionDigits: 0,
  });

  const analyses = new Map(
    analyseTrip(trip.blocks.map(toBlockLike), { tripStyle: "balanced", party }).map(
      (a) => [a.date, a],
    ),
  );

  const dates: string[] = [];
  for (let t = trip.startDate.getTime(); t <= trip.endDate.getTime(); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  const userIds = trip.members.map((m) => m.userId);
  const expenseLikes: ExpenseLike[] = trip.expenses.map((e) => ({
    payerId: e.payerId, amount: e.amount, shares: e.shares as Record<string, number>,
  }));
  const nets = balances(expenseLikes, userIds);
  const transfers = settle(expenseLikes, userIds);
  const nameOf = (uid: string) =>
    trip.members.find((m) => m.userId === uid)?.user.name ?? uid;
  const totalSpent = trip.expenses.reduce((s, e) => s + e.amount, 0);
  const totalKm = analyses.size;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:px-0 print:py-0">
      <PrintTrigger />

      {/* boarding-pass style header */}
      <header className="overflow-hidden rounded-3xl border-2 border-sea print:break-inside-avoid">
        <div
          className="px-6 py-5 text-white"
          style={{ background: "linear-gradient(120deg,#0C7C86 0%,#178A69 55%,#E5A017 140%)" }}
        >
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">
            <span>🧭 Wayfare</span>
            <span>Journey with joy, return with memories</span>
          </div>
          <h1 className="mt-2 font-poppins text-3xl font-bold leading-tight tracking-tight">
            {trip.title}
          </h1>
          <div className="mt-1 font-mono text-sm opacity-95">
            📍 {trip.destination}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
            <span className="rounded-full bg-white/20 px-3 py-1">
              🗓️ {format(trip.startDate, "d MMM")} → {format(trip.endDate, "d MMM yyyy")}
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1">
              ☀️ {dates.length} days
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1">
              👥 {party?.travellers?.length ?? 0} travelling
            </span>
          </div>
        </div>

        {/* the crew */}
        <div className="flex flex-wrap gap-2 bg-paper px-6 py-3">
          {party?.travellers?.map((t) => (
            <span
              key={t.name}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs"
            >
              <strong className="font-poppins">
                {t.kind === "kid" ? "🧒" : t.kind === "senior" ? "🧓" : "🧑"} {t.name}
              </strong>
              {t.age ? <span className="text-ink-3"> · {t.age}</span> : null}
              {t.mobility === "limited" && <span> · 🦵 takes it slow</span>}
              {t.allergies?.length ? <span> · 🥜 {t.allergies.join(", ")}</span> : null}
              {t.diet === "veg" && <span> · 🥗</span>}
            </span>
          ))}
        </div>
      </header>

      {/* day by day */}
      {dates.map((date, i) => {
        const blocks = trip.blocks.filter(
          (b) => b.date.toISOString().slice(0, 10) === date,
        );
        const a = analyses.get(date);
        const c = DAY_COLORS[i % DAY_COLORS.length];
        return (
          <section key={date} className="mt-5 break-inside-avoid">
            <div
              className="flex flex-wrap items-center gap-2 rounded-t-2xl px-4 py-2"
              style={{ background: c.bg }}
            >
              <span
                className="flex size-8 items-center justify-center rounded-full font-poppins text-sm font-bold text-white"
                style={{ background: c.ink }}
              >
                {i + 1}
              </span>
              <span className="font-poppins text-base font-bold tracking-tight" style={{ color: c.ink }}>
                {format(parseISO(date), "EEEE d MMMM")}
              </span>
              {a && (
                <span className="ml-auto font-mono text-[11px]" style={{ color: c.ink }}>
                  🎒 {fmtDur(a.activeMin)} out and about · 🚗 {fmtDur(a.travelMin)} on the move
                </span>
              )}
            </div>

            <div className="rounded-b-2xl border-x border-b border-line bg-surface px-4 py-3">
              {blocks.length === 0 && (
                <p className="py-2 text-sm italic text-ink-3">
                  🌴 Nothing booked — a day to do whatever you feel like.
                </p>
              )}

              {blocks.map((b, bi) => {
                const meta = (b.meta as Meta) ?? {};
                const rows = Object.entries(meta)
                  .filter(([, v]) => v != null && v !== "")
                  .map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)] as const);
                if (b.address) rows.push(["address", b.address] as const);
                return (
                  <div
                    key={b.id}
                    className={`flex gap-3 break-inside-avoid py-2 ${bi > 0 ? "border-t border-dashed border-line" : ""}`}
                  >
                    <div className="w-20 shrink-0 pt-0.5 text-right font-mono text-xs">
                      <div className="font-semibold text-ink">{b.startTime ?? "—"}</div>
                      {b.endTime && <div className="text-ink-3">{b.endTime}</div>}
                    </div>
                    <div className="shrink-0 text-lg leading-none">
                      {BLOCK_EMOJI[b.type] ?? "📌"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-poppins text-sm font-semibold">{b.title}</span>
                        {b.cost != null && (
                          <span className="ml-auto shrink-0 font-mono text-sm text-ink-2">
                            {money.format(b.cost)}
                          </span>
                        )}
                      </div>
                      {b.subtitle && (
                        <div className="text-sm text-ink-2">{b.subtitle}</div>
                      )}
                      {b.tags.length > 0 && (
                        <div className="mt-0.5 text-xs text-ink-3">
                          {b.tags.map((t) => `${TAG_EMOJI[t] ?? "•"} ${t}`).join("  ")}
                        </div>
                      )}
                      {rows.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-paper px-3 py-2 font-mono text-[11px]">
                          {rows.map(([k, value]) => (
                            <span key={k}>
                              <span className="text-ink-3">
                                {META_EMOJI[k] ?? "•"} {META_LABELS[k] ?? k}:{" "}
                              </span>
                              <strong className="text-ink">{value}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* money */}
      {trip.expenses.length > 0 && (
        <section className="mt-6 break-inside-avoid overflow-hidden rounded-2xl border-2 border-ok">
          <div className="bg-ok-soft px-4 py-2">
            <span className="font-poppins text-base font-bold tracking-tight text-ok">
              💰 {trip.expenses.length} expenses → settle up in {transfers.length}{" "}
              {transfers.length === 1 ? "payment" : "payments"}
            </span>
            <span className="ml-2 font-mono text-xs text-ok">
              ({money.format(totalSpent)} all in)
            </span>
          </div>
          <div className="grid gap-5 bg-surface px-4 py-3 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-3">
                🧾 Where everyone stands
              </div>
              {userIds.map((uid) => {
                const net = nets.get(uid) ?? 0;
                return (
                  <div key={uid} className="flex justify-between font-mono text-xs">
                    <span>{nameOf(uid)}</span>
                    <span>
                      {net > 0.005
                        ? `😄 is owed ${money.format(net)}`
                        : net < -0.005
                          ? `😅 owes ${money.format(-net)}`
                          : "✅ settled"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-3">
                🤝 Just these payments
              </div>
              {transfers.map((t, i) => (
                <div key={i} className="flex justify-between font-mono text-xs">
                  <span>
                    {nameOf(t.fromUserId)} → {nameOf(t.toUserId)}
                  </span>
                  <strong>{money.format(t.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-6 rounded-2xl bg-paper-2 px-4 py-3 text-center">
        <div className="font-poppins text-sm font-bold tracking-tight text-ink">
          ✨ Have the best time ✨
        </div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
          {totalKm} days planned with Wayfare · keep this handy 📄
        </div>
      </footer>
    </div>
  );
}

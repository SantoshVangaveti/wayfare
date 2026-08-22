// The whole trip on paper — for the person who doesn't have the app.
// Opens the print dialog on load; "Save as PDF" gives them everything:
// every day, every time, every confirmation number, phone and address.

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

const META_LABELS: Record<string, string> = {
  confirmationNumber: "Confirmation",
  phone: "Phone",
  address: "Address",
  checkIn: "Check-in",
  checkOut: "Check-out",
  cancelBy: "Free cancellation until",
  flightNumber: "Flight",
  airline: "Airline",
  terminal: "Terminal",
  gate: "Gate",
  seat: "Seat",
  seats: "Seats",
  hostName: "Host",
  wifi: "Wi-Fi",
  includedMeals: "Meals included",
  notes: "Notes",
};

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
    style: "currency",
    currency: trip.currency,
    maximumFractionDigits: 0,
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
    payerId: e.payerId,
    amount: e.amount,
    shares: e.shares as Record<string, number>,
  }));
  const nets = balances(expenseLikes, userIds);
  const transfers = settle(expenseLikes, userIds);
  const nameOf = (uid: string) =>
    trip.members.find((m) => m.userId === uid)?.user.name ?? uid;
  const totalSpent = trip.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="mx-auto w-full max-w-3xl bg-white px-8 py-10 text-ink print:max-w-none print:px-0 print:py-0">
      <PrintTrigger />

      {/* header */}
      <header className="mb-6 border-b-2 border-ink pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-poppins text-3xl font-bold tracking-tight">
            {trip.title}
          </h1>
          <span className="font-mono text-xs uppercase tracking-widest text-ink-3">
            Wayfare
          </span>
        </div>
        <div className="mt-1 font-mono text-sm text-ink-2">
          {trip.destination} · {format(trip.startDate, "EEE d MMM yyyy")} –{" "}
          {format(trip.endDate, "EEE d MMM yyyy")} · {dates.length} days
        </div>
        <div className="mt-2 text-sm text-ink-2">
          <strong className="font-poppins">Travelling:</strong>{" "}
          {party?.travellers
            ?.map(
              (t) =>
                `${t.name}${t.age ? ` (${t.age})` : ""}${
                  t.mobility === "limited" ? ", limited mobility" : ""
                }${t.allergies?.length ? `, allergic to ${t.allergies.join(" & ")}` : ""}`,
            )
            .join(" · ")}
        </div>
      </header>

      {/* day by day */}
      {dates.map((date, i) => {
        const blocks = trip.blocks.filter(
          (b) => b.date.toISOString().slice(0, 10) === date,
        );
        const a = analyses.get(date);
        return (
          <section key={date} className="mb-6 break-inside-avoid">
            <h2 className="mb-2 border-b border-line pb-1 font-poppins text-lg font-bold tracking-tight">
              Day {i + 1}
              <span className="ml-2 font-mono text-sm font-normal text-ink-2">
                {format(parseISO(date), "EEEE d MMMM")}
              </span>
              {a && (
                <span className="ml-2 font-mono text-xs font-normal text-ink-3">
                  {fmtDur(a.activeMin)} active · {fmtDur(a.travelMin)} travel
                </span>
              )}
            </h2>

            {blocks.length === 0 && (
              <p className="py-2 text-sm italic text-ink-3">Nothing scheduled.</p>
            )}

            {blocks.map((b) => {
              const meta = (b.meta as Meta) ?? {};
              const rows = Object.entries(meta)
                .filter(([, v]) => v != null && v !== "")
                .map(
                  ([k, v]) =>
                    [META_LABELS[k] ?? k, Array.isArray(v) ? v.join(", ") : String(v)] as const,
                );
              if (b.address) rows.push(["Address", b.address] as const);
              return (
                <div
                  key={b.id}
                  className="mb-2 break-inside-avoid border-l-2 border-line pl-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 font-mono text-sm font-semibold">
                      {b.startTime ?? "—"}
                      {b.endTime ? `–${b.endTime}` : ""}
                    </span>
                    <span className="font-poppins text-sm font-semibold">{b.title}</span>
                    <span className="font-mono text-[10px] uppercase text-ink-3">
                      {b.type}
                    </span>
                    {b.cost != null && (
                      <span className="ml-auto font-mono text-sm">
                        {money.format(b.cost)}
                      </span>
                    )}
                  </div>
                  {b.subtitle && (
                    <div className="ml-24 pl-2 text-sm text-ink-2">{b.subtitle}</div>
                  )}
                  {rows.length > 0 && (
                    <dl className="ml-24 mt-1 grid grid-cols-[9rem_1fr] gap-x-2 pl-2 font-mono text-xs">
                      {rows.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-ink-3">{label}</dt>
                          <dd className="text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {/* money */}
      {trip.expenses.length > 0 && (
        <section className="mt-8 break-inside-avoid border-t-2 border-ink pt-4">
          <h2 className="mb-2 font-poppins text-lg font-bold tracking-tight">
            Money — {money.format(totalSpent)} spent, settle up in{" "}
            {transfers.length} {transfers.length === 1 ? "payment" : "payments"}
          </h2>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-3">
                Where everyone stands
              </div>
              {userIds.map((uid) => {
                const net = nets.get(uid) ?? 0;
                return (
                  <div key={uid} className="flex justify-between font-mono">
                    <span>{nameOf(uid)}</span>
                    <span>
                      {net > 0.005
                        ? `is owed ${money.format(net)}`
                        : net < -0.005
                          ? `owes ${money.format(-net)}`
                          : "settled"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-3">
                The payments
              </div>
              {transfers.map((t, i) => (
                <div key={i} className="flex justify-between font-mono">
                  <span>
                    {nameOf(t.fromUserId)} → {nameOf(t.toUserId)}
                  </span>
                  <span>{money.format(t.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="mt-8 border-t border-line pt-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-3">
        Journey with joy, return with memories · planned with Wayfare
      </footer>
    </div>
  );
}

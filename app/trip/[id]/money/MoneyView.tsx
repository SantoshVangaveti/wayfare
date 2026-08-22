"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";
import type { Transfer } from "@/lib/types";
import { Chip } from "@/components/Chip";
import { cn } from "@/lib/utils";
import { createExpense } from "./actions";

interface Member {
  id: string;
  name: string;
  avatar: string | null;
}

export function MoneyView({
  tripId,
  currency,
  members,
  balances,
  transfers,
  expenses,
}: {
  tripId: string;
  currency: string;
  members: Member[];
  balances: { userId: string; net: number }[];
  transfers: Transfer[];
  expenses: {
    id: string;
    description: string;
    amount: number;
    payerId: string;
    payerName: string;
  }[];
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [currency],
  );
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const name = (id: string) => byId.get(id)?.name ?? id;

  const Avatar = ({ id, className }: { id: string; className?: string }) => (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-sea-soft font-poppins text-xs font-semibold text-sea",
        className,
      )}
    >
      {byId.get(id)?.avatar ?? name(id)[0]}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* the collapse headline */}
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <div className="font-poppins text-xl font-bold tracking-tight">
          {expenses.length} expenses → settle up in {transfers.length}{" "}
          {transfers.length === 1 ? "payment" : "payments"}
        </div>
        <div className="mt-1 text-sm text-ink-2">
          Everyone square with the fewest possible transfers.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* balances */}
        <section className="space-y-2">
          <h2 className="font-poppins text-base font-bold tracking-tight">
            Where everyone stands
          </h2>
          {balances.map(({ userId, net }) => (
            <div
              key={userId}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <Avatar id={userId} />
              <span className="font-poppins text-sm font-semibold">{name(userId)}</span>
              <span
                className={cn(
                  "ml-auto font-mono text-sm font-semibold",
                  net > 0.005 ? "text-ok" : net < -0.005 ? "text-mango" : "text-ink-3",
                )}
              >
                {net > 0.005
                  ? `is owed ${money.format(net)}`
                  : net < -0.005
                    ? `owes ${money.format(-net)}`
                    : "settled"}
              </span>
            </div>
          ))}
        </section>

        {/* the payments */}
        <section className="space-y-2">
          <h2 className="font-poppins text-base font-bold tracking-tight">
            The {transfers.length} payments
          </h2>
          {transfers.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <Avatar id={t.fromUserId} />
              <span className="text-sm">{name(t.fromUserId)}</span>
              <ArrowRight className="size-4 text-ink-3" />
              <Avatar id={t.toUserId} />
              <span className="text-sm">{name(t.toUserId)}</span>
              <span className="ml-auto font-mono text-sm font-semibold text-ink">
                {money.format(t.amount)}
              </span>
            </div>
          ))}
          {transfers.length === 0 && (
            <p className="text-sm text-ink-3">All square — nothing to settle.</p>
          )}
        </section>
      </div>

      {/* expense list */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-poppins text-base font-bold tracking-tight">
            Every expense
          </h2>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sea px-3 py-2 font-poppins text-xs font-semibold text-white hover:opacity-90"
          >
            <Plus className="size-4" /> Add expense
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {expenses.map((e, i) => (
            <div
              key={e.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5",
                i > 0 && "border-t border-line",
              )}
            >
              <Avatar id={e.payerId} className="size-6 text-[10px]" />
              <span className="min-w-0 flex-1 truncate text-sm">{e.description}</span>
              <Chip className="hidden sm:inline-flex">{e.payerName} paid</Chip>
              <span className="font-mono text-sm">{money.format(e.amount)}</span>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="p-4 text-sm text-ink-3">No expenses yet.</p>
          )}
        </div>
      </section>

      {sheetOpen && (
        <AddExpenseSheet
          tripId={tripId}
          members={members}
          currency={currency}
          onClose={() => {
            setSheetOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddExpenseSheet({
  tripId,
  members,
  currency,
  onClose,
}: {
  tripId: string;
  members: Member[];
  currency: string;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState(members[0]?.id ?? "");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const valid = description.trim() && Number(amount) > 0 && excluded.length < members.length;

  function submit() {
    startTransition(async () => {
      const res = await createExpense(tripId, {
        description,
        amount: Number(amount),
        payerId,
        excludeIds: excluded,
      });
      if (res.ok) onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-poppins text-base font-bold tracking-tight">Add expense</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-3 hover:bg-paper-2">
            <X className="size-4" />
          </button>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it?"
          className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-sea"
        />
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={`Amount (${currency})`}
            inputMode="decimal"
            className="flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-sm outline-none focus:border-sea"
          />
          <select
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            aria-label="Who paid"
            className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-sea"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} paid
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">
            Split equally between
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const out = excluded.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() =>
                    setExcluded((prev) =>
                      out ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 font-poppins text-xs font-semibold transition",
                    out
                      ? "border-line text-ink-3 line-through"
                      : "border-sea bg-sea-soft text-sea",
                  )}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={submit}
          disabled={!valid || pending}
          className="w-full rounded-xl bg-sea px-4 py-2.5 font-poppins text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Add it"}
        </button>
      </div>
    </div>
  );
}

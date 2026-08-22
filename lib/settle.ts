// ============================================================================
// Turn a pile of shared expenses into the fewest possible payments.
// Pure and deterministic — ties break by userId so the output never wobbles.
// ============================================================================

import type { ExpenseLike, Transfer } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

/** Net position per person. Positive === is owed money. */
export function balances(expenses: ExpenseLike[], userIds: string[]): Map<string, number> {
  const net = new Map(userIds.map((id) => [id, 0]));
  for (const e of expenses) {
    net.set(e.payerId, (net.get(e.payerId) ?? 0) + e.amount);
    for (const [uid, owed] of Object.entries(e.shares)) {
      net.set(uid, (net.get(uid) ?? 0) - owed);
    }
  }
  for (const [k, v] of net) net.set(k, round2(v));
  return net;
}

/**
 * Greedy largest-creditor / largest-debtor matching.
 * Produces at most n-1 transfers, usually far fewer than the expense count —
 * which is the whole point: "12 payments" becomes "3 payments".
 */
export function settle(expenses: ExpenseLike[], userIds: string[]): Transfer[] {
  const net = balances(expenses, userIds);

  const creditors = [...net].filter(([, v]) => v > EPS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, v]) => ({ id, amt: v }));
  const debtors = [...net].filter(([, v]) => v < -EPS)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id, v]) => ({ id, amt: -v }));

  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const pay = Math.min(creditors[i].amt, debtors[j].amt);
    if (pay > EPS) {
      out.push({ fromUserId: debtors[j].id, toUserId: creditors[i].id, amount: round2(pay) });
    }
    creditors[i].amt -= pay;
    debtors[j].amt -= pay;
    if (creditors[i].amt <= EPS) i++;
    if (debtors[j].amt <= EPS) j++;
  }
  return out;
}

/** Equal split helper — last share absorbs the rounding remainder. */
export function splitEqually(amount: number, userIds: string[]): Record<string, number> {
  const each = Math.floor((amount / userIds.length) * 100) / 100;
  const shares: Record<string, number> = {};
  userIds.forEach((id, i) => {
    shares[id] = i === userIds.length - 1
      ? round2(amount - each * (userIds.length - 1))
      : each;
  });
  return shares;
}

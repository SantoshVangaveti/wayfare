// Run: npx tsx lib/feasibility.test.ts
// Tiny hand-rolled assertions — no test runner needed, and they must all pass
// before you trust a single warning the UI shows.

import { analyseDay, travelTime, isOpenAt, paceBudget, toMin, fmtDur } from "./feasibility";
import { settle, splitEqually, balances } from "./settle";
import type { BlockLike, Party } from "./types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
}

const FAMILY: Party = {
  travellers: [
    { name: "Maya", kind: "adult", age: 38, diet: "veg" },
    { name: "Ravi", kind: "adult", age: 41 },
    { name: "Ira", kind: "kid", age: 7 },
    { name: "Nikhil", kind: "kid", age: 11 },
    { name: "Amma", kind: "senior", age: 68, mobility: "limited" },
  ],
};

console.log("\ntime + distance");
check("toMin", toMin("09:30") === 570);
check("fmtDur", fmtDur(145) === "2h 25m", fmtDur(145));
{
  // Edakkal Caves -> Soochipara Falls, ~15 km apart
  const leg = travelTime({ lat: 11.6244, lng: 76.2472 }, { lat: 11.49, lng: 76.21 });
  check("drive leg is 35-60 min", leg.min > 35 && leg.min < 60, `got ${leg.min}`);
  check("drive mode", leg.mode === "drive");
}
{
  const leg = travelTime({ lat: 11.6087, lng: 76.0837 }, { lat: 11.6095, lng: 76.0845 });
  check("short hop walks", leg.mode === "walk", `got ${leg.mode}`);
}

console.log("\nopening hours");
check("open midday wed", isOpenAt({ wed: ["09:00", "17:00"] }, "2026-09-09", "12:00"));
check("closed at 17:30", !isOpenAt({ wed: ["09:00", "17:00"] }, "2026-09-09", "17:30"));
check("absent day is closed", !isOpenAt({ mon: ["09:00", "17:00"] }, "2026-09-09", "12:00"));
check("unknown hours never block", isOpenAt(null, "2026-09-09", "23:00"));

console.log("\npace");
check("balanced solo adult = 540", paceBudget("balanced") === 540, `${paceBudget("balanced")}`);
check("family shrinks the day", paceBudget("balanced", FAMILY) < 400, `${paceBudget("balanced", FAMILY)}`);

console.log("\nthe broken day 3");
const day3: BlockLike[] = [
  { id: "b1", type: "ACTIVITY", title: "Jeep safari, Muthanga", date: "2026-09-09",
    startTime: "06:00", durationMin: 120, lat: 11.6667, lng: 76.4167,
    openHours: { wed: ["06:00", "10:00"] } },
  { id: "b2", type: "ACTIVITY", title: "Edakkal Caves", date: "2026-09-09",
    startTime: "11:00", durationMin: 155, lat: 11.6244, lng: 76.2472,
    tags: ["strenuous"], openHours: { wed: ["09:00", "16:00"] } },
  { id: "b3", type: "ACTIVITY", title: "Soochipara Falls", date: "2026-09-09",
    startTime: "14:00", durationMin: 120, lat: 11.49, lng: 76.21,
    openHours: { wed: ["09:00", "17:00"] } },
  { id: "b4", type: "ACTIVITY", title: "Uravu bamboo workshop", date: "2026-09-09",
    startTime: "17:30", durationMin: 90, lat: 11.6087, lng: 76.0837,
    openHours: { wed: ["09:30", "17:00"] } },
];
const a = analyseDay(day3, { tripStyle: "balanced", party: FAMILY });
console.log("   ", a.warnings.map((w) => `[${w.level}] ${w.code}`).join("  "));
const codes = a.warnings.map((w) => w.code);
check("catches the impossible drive", codes.includes("TRAVEL_IMPOSSIBLE"));
check("catches the closed workshop", codes.includes("CLOSED"));
check("flags the climb for Amma", codes.includes("MOBILITY"));
check("flags the 06:00 start", codes.includes("EARLY_FOR_KIDS"));
check("flags the overall load", codes.includes("OVER_PACE"));
check("day is not ok", !a.ok);
check("score below 50", a.score < 50, `score ${a.score}`);

console.log("\na day that works");
const goodDay: BlockLike[] = [
  { id: "g1", type: "ACTIVITY", title: "Pookode Lake loop", date: "2026-09-10",
    startTime: "10:00", durationMin: 60, lat: 11.5361, lng: 76.0244,
    openHours: { thu: ["08:00", "17:00"] } },
  { id: "g2", type: "MEAL", title: "Lunch, Kalpetta", date: "2026-09-10",
    startTime: "13:00", durationMin: 60, lat: 11.6087, lng: 76.0837,
    openHours: { thu: ["07:30", "22:00"] } },
];
const g = analyseDay(goodDay, { tripStyle: "balanced", party: FAMILY });
check("clean day has no errors", g.warnings.filter((w) => w.level === "error").length === 0,
  JSON.stringify(g.warnings));
check("clean day scores 100", g.score === 100, `score ${g.score}`);

console.log("\ntransit blocks are the journey, not a place");
const arrivalDay: BlockLike[] = [
  { id: "t1", type: "FLIGHT", title: "Flight to Kozhikode", date: "2026-09-07",
    startTime: "06:40", durationMin: 80, lat: 13.1986, lng: 77.7066 },
  { id: "t2", type: "TRANSIT", title: "Drive to Vythiri", date: "2026-09-07",
    startTime: "09:00", durationMin: 120, lat: 11.55, lng: 76.04 },
  { id: "t3", type: "LODGING", title: "Check in", date: "2026-09-07",
    startTime: "12:00", lat: 11.55, lng: 76.04 },
];
const t = analyseDay(arrivalDay, { tripStyle: "balanced" });
check("no false impossible-travel around transit",
  !t.warnings.some((w) => w.code === "TRAVEL_IMPOSSIBLE"),
  JSON.stringify(t.warnings));
check("transit duration counts as travel", t.travelMin >= 200 && t.travelMin <= 220,
  `${t.travelMin}`);
check("transit duration is not activity", t.activeMin === 0, `${t.activeMin}`);

console.log("\noverlap");
const overlap = analyseDay([
  { id: "o1", type: "ACTIVITY", title: "A", date: "2026-09-11", startTime: "10:00", durationMin: 120 },
  { id: "o2", type: "ACTIVITY", title: "B", date: "2026-09-11", startTime: "11:00", durationMin: 60 },
], { tripStyle: "balanced" });
check("catches overlap", overlap.warnings.some((w) => w.code === "OVERLAP"));

console.log("\nsettle up");
const ids = ["u1", "u2", "u3", "u4"];
const expenses = [
  { payerId: "u1", amount: 12000, shares: splitEqually(12000, ids) },
  { payerId: "u2", amount: 4000, shares: splitEqually(4000, ids) },
  { payerId: "u1", amount: 3000, shares: splitEqually(3000, ids) },
  { payerId: "u3", amount: 2000, shares: splitEqually(2000, ids) },
  { payerId: "u4", amount: 1000, shares: splitEqually(1000, ids) },
];
const bal = balances(expenses, ids);
const sum = [...bal.values()].reduce((s, v) => s + v, 0);
check("balances net to zero", Math.abs(sum) < 0.05, `${sum}`);
const transfers = settle(expenses, ids);
console.log("   ", transfers.map((t) => `${t.fromUserId}->${t.toUserId} ${t.amount}`).join("  "));
check("fewer transfers than expenses", transfers.length < expenses.length,
  `${transfers.length} vs ${expenses.length}`);
check("at most n-1 transfers", transfers.length <= ids.length - 1);
{
  const after = new Map(bal);
  for (const t of transfers) {
    after.set(t.fromUserId, after.get(t.fromUserId)! + t.amount);
    after.set(t.toUserId, after.get(t.toUserId)! - t.amount);
  }
  check("everyone settles to zero", [...after.values()].every((v) => Math.abs(v) < 0.05),
    JSON.stringify([...after]));
}
{
  const s = splitEqually(100, ["a", "b", "c"]);
  const t = Object.values(s).reduce((x, y) => x + y, 0);
  check("uneven split still totals exactly", Math.abs(t - 100) < 0.001, `${t}`);
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

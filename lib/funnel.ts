// Client-side funnel state, carried across /plan/* in sessionStorage.
// It becomes a TravelProfile + Party when the trip is created.

import type { Traveller } from "./types";
import type { Place } from "./location";

export interface FunnelState {
  interests: string[];
  freeText: string;
  scope: "domestic" | "international" | "either";
  home: Place | null;
  startDate: string;            // "YYYY-MM-DD"
  endDate: string;
  transport: string[];
  budgetPerDay: number | null;  // null === "go wild"
  diet: string[];
  allergies: string;
  party: Traveller[];
}

const KEY = "wayfare.funnel";

export function loadFunnel(): FunnelState | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveFunnel(s: FunnelState) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function defaultFunnel(): FunnelState {
  const d = (offset: number) => {
    const t = new Date(Date.now() + offset * 86_400_000);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  return {
    interests: [],
    freeText: "",
    scope: "domestic",
    home: null,
    startDate: d(21),
    endDate: d(26),
    transport: [],
    budgetPerDay: 6000,
    diet: [],
    allergies: "",
    party: [
      { name: "Traveller 1", kind: "adult" },
      { name: "Traveller 2", kind: "adult" },
    ],
  };
}

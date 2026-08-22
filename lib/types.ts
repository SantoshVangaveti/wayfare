// ============================================================================
// The contract. Every other file imports from here. Do not redeclare these.
// ============================================================================

export type TripStyle = "relaxed" | "balanced" | "packed";
export type Diet = "any" | "veg" | "vegan" | "jain" | "halal" | "nonveg";
export type TravelScope = "domestic" | "international" | "either";

/** One traveller's constraints. Drives pacing, warnings, filters, packing. */
export interface Traveller {
  name: string;
  kind: "adult" | "kid" | "senior";
  age?: number;
  /** free-text notes the AI and the engine both read */
  mobility?: "full" | "limited";
  health?: string[];        // ["asthma", "knee-injury"]
  allergies?: string[];     // ["nuts", "shellfish"]
  diet?: Diet;
}

/** Who is on this trip. Set once at onboarding, used everywhere after. */
export interface Party {
  travellers: Traveller[];
}

export interface TravelProfile {
  interests: string[];              // ["mountains","food","nature"]
  freeText?: string;                // the optional box — highest-value field
  tripStyle: TripStyle;
  scope: TravelScope;
  homeCity?: string;
  homeCountry?: string;             // "IN"
  homeLat?: number;
  homeLng?: number;
  transport: string[];              // ["flight","train","road","ferry","bus","any"]
  stayTypes: string[];              // ["homestay","cabin","hotel","resort","hostel"]
  budgetPerDay?: number | null;     // null === "go wild"
  currency: string;
}

export type BlockType =
  | "FLIGHT" | "TRAIN" | "BUS" | "FERRY"
  | "LODGING" | "ACTIVITY" | "MEAL" | "TRANSIT" | "NOTE";

export type BlockStatus = "PLANNED" | "CONFIRMED" | "DONE" | "SKIPPED";

/** Opening hours, destination-local. Closed days are simply absent. */
export type OpenHours = Partial<Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  [string, string]                  // ["09:00","17:00"]
>>;

/** Everything analyseDay() needs. Deliberately looser than the Prisma model
 *  so the engine can run on unsaved, AI-proposed blocks too. */
export interface BlockLike {
  id: string;
  type: BlockType;
  title: string;
  date: string;                     // "2026-09-09" destination-local
  startTime?: string | null;        // "09:30" — ALWAYS local, never UTC
  endTime?: string | null;
  durationMin?: number | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
  openHours?: OpenHours | null;
  attendees?: string[];             // userIds; empty === everyone
}

export type WarningLevel = "error" | "warn" | "info";

export interface Warning {
  level: WarningLevel;
  message: string;
  blockId?: string;
  /** stable key so the UI and the repair prompt can dedupe */
  code:
    | "CLOSED" | "TRAVEL_IMPOSSIBLE" | "TRAVEL_TIGHT" | "OVERLAP"
    | "OVER_PACE" | "NO_MEAL" | "BRUTAL_WAKEUP" | "MOBILITY" | "EARLY_FOR_KIDS"
    | "HEALTH";
}

export interface DayAnalysis {
  date: string;
  activeMin: number;
  travelMin: number;
  slackMin: number;
  paceBudgetMin: number;
  warnings: Warning[];
  /** 0–100. Below 100 means something is wrong. */
  score: number;
  get ok(): boolean;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface ExpenseLike {
  payerId: string;
  amount: number;
  /** { userId: amountOwed } — must sum to `amount` */
  shares: Record<string, number>;
}

# Wayfare

A trip planner that knows what a day actually feels like — real distances, opening
hours, and who is travelling — and then stays with the user during the trip,
holding every booking and phone number in one place.

**Hackathon build. Optimise for a working demo over completeness.**

---

## Non-negotiables

- `prisma/schema.prisma` is **FROZEN**. Never add, rename or remove a field. If you
  think you need one, stop and ask.
- `lib/types.ts` is the contract. Import from it; never redeclare its types.
- **All times are `"HH:MM"` strings in destination-local time.** Never convert to UTC.
  Dates are midnight `DateTime`. Timezone conversion has killed more hackathon
  projects than any other single thing.
- Feasibility logic lives **only** in `lib/feasibility.ts`. Never reimplement any part
  of it in a component. Never call an AI to decide whether a day is possible.
- Settle-up logic lives **only** in `lib/settle.ts`.
- `lib/ai.ts` is the only file that talks to an AI provider.
- **No auth.** The current user comes from `lib/session.ts` (a cookie holding a userId).
  A user-switcher dropdown sits in the top bar.
- Every block renders through `<BlockCard/>`. Never inline block markup.
- Server Components for reads. Server Actions for writes. No API routes except
  `/api/inbound` (the email webhook).
- **No external API calls except**: Open-Meteo (weather + geocoding), BigDataCloud
  (reverse geocode), the configured AI provider. No Google Maps API, no Places API,
  no scraping. Maps are deep links via `lib/maps.ts`.
- No new npm dependencies without asking.

## Never do these

- Do not scrape flight or hotel sites. Show seeded option cards that link out.
- Do not request geolocation on mount. Only from a click handler.
- Do not auto-apply an AI extraction. Always show a review card first.
- Do not put the AI key in `.env`. It lives encrypted in `AppSettings`.
- Do not "fix" Day 3 in the seed data. It is broken on purpose.

---

## Architecture in four sentences

Two on-ramps — plan-with-AI and import-from-email — both create the same **Trip**,
whose days are made of **Block** rows. After that, seven tabs (Overview, Plan,
Explore, Inbox, Vault, Money, Story) are all reachable from each other. When the trip
goes ACTIVE, **Today** replaces Overview as the default tab. The AI proposes plans;
`analyseDay()` decides whether they are physically possible, and only a plan that
passes is ever shown to the user.

---

## Design system

There are no design mockups. Build from this. Be consistent above all else.

### Colour — light theme is the default and the only one required

```css
--paper:#F3F7F8;  --surface:#FCFDFD;  --paper-2:#E6EFF1;
--ink:#0F2530;    --ink-2:#3B5661;    --ink-3:#6E8791;
--line:#D2E0E4;   --line-2:#B6CAD0;
--sea:#0C7C86;    --sea-soft:#DCEFF1;   /* primary, brand, "active time"      */
--mango:#D25E18;  --mango-soft:#FBE6D7; /* warnings, travel time              */
--sun:#E5A017;    --sun-soft:#FDF2DA;   /* the Companion, highlights          */
--ok:#178A69;     --ok-soft:#D6EFE7;    /* done, confirmed, positive balance  */
```

Semantic rule: **teal = time doing things, mango = time travelling or a problem,
sun = the Companion speaking, green = done.** Never use them decoratively.

### Type

- Headings and UI labels: Poppins (`font-poppins`), weights 600/700, tight tracking
- Body: Figtree or system sans
- **Times, prices, confirmation codes, small caps labels: monospace with
  `font-variant-numeric: tabular-nums`.** Non-negotiable — columns must line up.

### Feel

Holiday, warm, energetic, but composed. Photography-forward. Rounded (`rounded-xl`
to `rounded-2xl`), generous padding, soft shadows. Not childish, not corporate.

### Core components — build these first, reuse everywhere

- **`<BlockCard/>`** — grid: monospace time gutter (fixed width) · title + one line
  of detail · right-hand chip. Variants: `default`, `warn` (mango border + tint),
  `done` (teal border + check), `ghost` (dashed, for empty slots).
- **`<LoadBar/>`** — three segments: teal active, mango travel, grey slack. Always
  with a monospace key beneath (`6h 50m active · 3h 55m travel · 2h 05m slack`).
- **`<Companion/>`** — sun-tinted card, small round avatar, bold first line, one line
  of message, up to two small buttons.
- **`<Chip/>`** — small monospace pill. Variants: neutral, sea, mango, ok.
- **`<PhotoChoiceCard/>`** — image tile, bold label, one-line description. Selected
  state: teal border + soft teal ring.

### The Companion's voice

A well-travelled friend, not a mascot. **Two lines maximum. Never repeats itself.
One card on screen at a time.**

| Never | Always |
|---|---|
| "Oops! Busy day ahead! 😅🎒" | "Day 3 is a lot. Want me to move something?" |
| "Time to take a photo!!! 📸✨" | "You were at the falls two hours ago. Got a photo?" |
| "You're going to LOVE Wayanad! 🌴" | "Wayanad in September is wet. Worth it, but pack for it." |

Eight triggers, all derived from the itinerary and the clock — never a timer, never
random: a day fails the physics check · a day is empty · 48h before departure ·
first block of the day · a scenic block ends · the weather turns · the last block is
done · the trip finishes.

### Writing UI copy

Active voice. Say what happens. A refused location permission is **not an error** —
no red, no apology, just focus the text input and move on.

---

## Conventions

- Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, lucide-react, date-fns
- Currency: `Intl.NumberFormat("en-IN", { style: "currency", currency: trip.currency })`
- Maps: `mapsUrl()` / `directionsUrl()` / `telUrl()` from `lib/maps.ts`
- Every AI call site handles three states: **no key configured** (banner pointing at
  Settings, seeded data still renders) · **failed or timed out** (seeded fallback +
  quiet retry) · **working**. Build all three the first time, not at 11pm.
- Commit after every working screen: `git commit -am "plan view works"`

## Routes

```
/                         landing — two doors
/settings                 provider, model, API key, usage meter
/plan/interests           photo picker + optional free text
/plan/details             party · scope · location · dates · transport · budget · diet
/plan/destinations        five results with reasons + weather verdicts
/trip/new                 import path — name + dates only
/trip/[id]                Overview (default tab while PLANNING)
/trip/[id]/plan           day view + feasibility rail   ← the brain
/trip/[id]/explore        candidates, filters, votes
/trip/[id]/inbox          paste / drop / forward → review cards
/trip/[id]/vault          every confirmation number and phone
/trip/[id]/money          expenses + settle up
/trip/[id]/story          animated plan / memories reel
/trip/[id]/today          takes over as default when status === ACTIVE
/trip/[id]/bookings       option cards → deep links out       (cut first)
/trip/[id]/packing        generated list                       (cut second)
/t/[shareId]              public, read-only, no nav
/api/inbound              Postmark webhook — stores raw only
```

## Build order

Funnel → shell + tab bar → Plan → Today → Inbox → Vault → Money → Story → Explore
→ Bookings → Packing.

**Cut in this order when behind:** Bookings · Explore filters · drag-to-reorder ·
poster download · the `fixDay` auto-loop.
**Never cut:** the feasibility engine · inbox extraction · Today · the Vault ·
settle-up · the Companion.

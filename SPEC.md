# Wayfare — product spec

What each screen is, what it shows, and what it must get right.
Read alongside `CLAUDE.md` (rules + design system) and `PROMPTS.md` (build order).

---

## The three claims the product makes

1. **It knows a day is only so long.** Real distances, opening hours, activity
   durations, and who is travelling. The AI proposes; `analyseDay()` disposes.
2. **It eats your mess.** Forward an email, paste a message, drop a screenshot —
   it becomes a scheduled block with its confirmation number attached.
3. **It comes with you.** A calm companion during the trip, not a planner that
   goes quiet the day it matters.

**The test for anything new:** does it make the itinerary smarter, the trip's
information easier to reach, or the trip more fun to be on? If none, don't build it.

---

## 1 · `/` Landing

Two large photographic cards — **"Plan it with me"** and **"I've already booked"** —
each with one line of description. Settings gear top-right. A Companion card offering
the seeded demo trip.

No feature list, no sign-up, no explanation.

## 2 · `/plan/interests`

Heading "What sounds good?". 2-column grid of six `PhotoChoiceCard`: Mountains,
Beaches, City life, Nature, Food, Heritage. Multi-select.

Below: an **optional free-text box**. This is the highest-value field in the app —
it is what lets destination reasons sound personal instead of generic. Placeholder
should model the kind of answer we want:

> "First trip since Dad's surgery. Somewhere green and calm — Amma is 68 and the
> kids are 7 and 11."

## 3 · `/plan/details`

- **Scope**: a segmented **Domestic | International | Either** control at the top.
  Domestic constrains suggestions to the home country, offers train/road/bus, and
  keeps one currency. International adds passport/visa items to the vault and
  packing, sets `trip.currency` to the destination's, and warns on unrealistic budgets.
- **Who's travelling** — adults, kids (with ages), seniors (with ages), and per-person
  mobility and health notes. Stored as `Party` on `trip.party`.
- **Location** — see the four states below.
- **Dates** — range picker.
- **Transport preference** — six `PhotoChoiceCard`: Flight, Train, Road trip, Ferry,
  Bus, Any. Hide Train/Road/Bus when scope is international and no land border.
- **Budget** — a number, or a **"Go wild"** button that sets it to `null`.
- **Diet + allergies** — chips.

### The location field — four states

```
idle      [ 📍 Use my current location ]   or type it  [ Start typing a city… ]
finding   spinner, cancellable after 8s
resolved  📍 Bengaluru, Karnataka · Not right? Change
refused   "Couldn't get your location — no problem, type it below"  (input focused)
```

**Never request geolocation on mount** — only from the button. A refused permission
is a normal choice, not an error: no red, no apology. `lib/location.ts` has
`detectLocation()`, `reverseGeocode()`, `searchPlaces()`. If the detected country
differs from the user's home country, flip scope to International and say so.

## 4 · `/plan/destinations`

Five results. The top one is a large photographic card with a match percentage and a
**three-line personal reason**; the rest are compact rows.

Every card carries a weather verdict chip: `GOOD` `MIXED` `MONSOON` `EXTREME HEAT`
`COLD`, from `lib/weather.ts`.

**Prompt rule:** reasons must reference something the traveller actually told us, or
a hard fact (drive time, step count, altitude). Generic praise — "vibrant culture",
"breathtaking scenery" — is explicitly forbidden in the system prompt.

Picking one creates the `Trip` and lands on Overview.

## 5 · `/trip/[id]` Overview

Cover image, dates, member avatars, a **day strip with a `LoadBar` per day**, budget
vs actual, and a next-up card. Links to Bookings and Packing.

## 6 · `/trip/[id]/bookings`

Six accommodation `PhotoChoiceCard` (Homestay, Cabin, Hotel, Resort, Hostel, Any)
filtered to budget and party size, then property rows and transport rows with prices
that **link out** — we are not a booking engine.

**Skippable.** A Companion card says so, and explains the cost honestly: without a
base location, travel times are estimated from the town centre.

## 7 · `/trip/[id]/explore`

Candidate grid with filter chips. The diet filter is pre-applied and says so
(`VEGETARIAN · 3 HIDDEN`). Each card shows distance from base, an **external link**,
a **map pin**, and a **vote count**. Anyone can vote; `candidate.votes` feeds
`buildItinerary` so popular things get better slots.

Allergy and mobility flags render as mango chips.

## 8 · `/trip/[id]/plan` — the brain

Day tabs. A vertical timeline of `BlockCard`s with a monospace time gutter. Right
rail (desktop) or a sheet (mobile): the `LoadBar`, slack readout, warning list, and a
**"Fix this day"** button.

Reordering re-runs `analyseDay()` **locally and instantly** — it is pure maths, never
an API call. Empty slots render as ghost cards with a "what should we do here?" action.

### The generate-and-check loop

```
buildItinerary (AI)  →  analyseDay() on every day  →  any error-level warnings?
   → yes: ONE repair call (fixDay) → re-validate → persist
   → no:  persist
```

The user never sees a plan that failed the check.

## 9 · `/trip/[id]/inbox`

The trip's own email address, prominently, with a copy button. Three doors: forward,
paste text, drop a screenshot.

`/api/inbound` stores raw only and returns 200 immediately. **Extraction is lazy** —
it runs when this screen loads any `Ingest` with `status: "pending"`. No queue, no
background jobs, no Vercel timeout risk.

Each extraction renders as a review card with a **confidence score**. Below 70% is
mango and editable. Nothing is ever applied silently.

Extraction must pull the operational payload, not just time and place: confirmation
number, phone, address, check-in/out, cancellation deadline, flight number, terminal,
gate, seat, host name, wifi.

## 10 · `/trip/[id]/vault`

Every confirmation number, phone, address, deadline and wifi credential in the trip,
grouped by day. Tap-to-call, tap-to-copy, tap-to-map. Searchable. A mango row for any
cancellation deadline inside 72 hours.

**Accepts new input for the whole trip** — "Add anything" opens the inbox. Adding
things later is the normal case.

Offline: a **Download PDF** button. (A service worker is the correct answer and is
explicitly post-hackathon.)

## 11 · `/trip/[id]/today`

Takes over as the default tab when `trip.status === "ACTIVE"`.

Morning Companion card: weather, who's doing what, and **your** wake-up time with the
reason attached. Then Now / next / later blocks with member avatars, a call button,
a map button, and a check-off.

**Wake-up is personal.** `block.attendees` decides who is in; anyone can sit one out;
your wake-up derives from the first block *you* are in. That is the whole answer to
the "but I want a lie-in" argument — no arbitration.

**Replan from here**: "Not feeling it" on the current block recomputes only the
*remainder* of the day. Completed blocks are fixed. Alternatives are drawn from
unscheduled candidates plus a constrained AI call.

## 12 · `/trip/[id]/money`

Balance rows per member (owed / owes), then **"Settle up in N payments"** from
`settle()`. Add-expense sheet with equal split and per-person exclusion.

Headline the collapse: *12 expenses → 4 payments*.

## 13 · `/trip/[id]/story`

One component, two modes. `mode="plan"` before the trip: an SVG route line that draws
itself between destinations, day nodes arriving in sequence with weather and
highlights. `mode="memories"` after: same animation, real photos, a stats card
counting up.

Photos attach to **blocks**, so captions already know place, day and time.

Outputs: **Watch** (fullscreen), **Share** (`/t/[shareId]`), **Download poster**
(`html-to-image` over a hidden 1080×1920 render).

No video encoding. CSS and Canvas only — nothing that can fail on stage.

## 14 · `/t/[shareId]` public share

Read-only, no navigation, no login. Long random unlisted id.

**Two tiers.** `shareLevel: "itinerary"` (default) shows places, days, times.
`"everything"` additionally shows confirmation numbers and phones, and requires an
explicit opt-in. Unlisted is fine for a day plan; it is not fine for PNRs.

## 15 · `/trip/[id]/packing`

Generated from weather + activities + party. One AI call. Items reference *why*:
"19 wet days", "90 min of ghat road, two kids", "nearest pharmacy is 20 min away".

## 16 · `/settings`

Provider and model dropdowns, free-tier chips, masked key field, **Test & Save**
(calls the provider before storing), and the **usage meter**: a progress ring of
requests today against the provider's daily cap, tokens, estimated cost, cache-hit
rate, and a by-feature breakdown. Warning banner at 80%.

Providers do not expose account balance over the API, so the meter measures **our own
consumption** from `AiUsage` — which is the number that actually matters.

---

## The five AI calls

| Function | Input | Output | Cached |
|---|---|---|---|
| `suggestDestinations` | TravelProfile + Party | 5 × `{name, country, lat, lng, why, estCostPerDay, matchScore}` | by profile hash |
| `suggestPlaces` | destination + profile | 12 activities + 10 restaurants as `Candidate[]` | by destination |
| `buildItinerary` | trip + voted candidates + party | `Block[]` with dates and times | no |
| `extractBlocks` | raw text **or** image | `{blocks[], confidence, sourceSummary}` | by content hash |
| `fixDay` | day blocks + warnings | reordered `Block[]` + explanation | no |

All go through `askAI()` in `lib/ai.ts`, which handles the provider, the Zod schema,
the cache and the usage log.

---

## Demo script — 4 minutes

1. **0:00** Open the seeded Wayanad trip. Never start on an empty state.
2. **0:20** Plan view, Day 3. Read a warning aloud: *"only 25 minutes between
   Edakkal and the falls, but it's a 45-minute drive."* And *"Amma's knee — 250 steps."*
   Hit **Fix this day**. Bar goes green. **This is the demo.**
3. **1:30** New trip. Forward/paste the seeded hotel email → review card → Add.
   Drop a screenshot → extracted → Add.
4. **2:30** The imported trip's Day 1: *"flight lands 22:35, reception closes 23:00."*
   The brain runs on imported plans too.
5. **3:10** Today view, then Money: *"12 expenses, settle up in 4 payments."*
6. **3:45** Story. Play. Stop talking. Let it run.

Rehearse twice. Fix only what breaks on the demo path.

# PROMPTS.md — what to paste into Claude Code, in order

**One screen per session.** Long sessions drift; short scoped ones don't.
Commit after each: `git commit -am "plan view works"`.

Every prompt assumes Claude Code has read `CLAUDE.md` and `SPEC.md`. Start each new
session with: *"Read CLAUDE.md and SPEC.md first."*

---

## 0 · Setup (do this once, tonight)

```
Read CLAUDE.md and SPEC.md.

Scaffold this project:
- Next.js 15 App Router, TypeScript, Tailwind, ESLint, no src dir
- shadcn/ui initialised
- deps: prisma @prisma/client ai @ai-sdk/google @ai-sdk/anthropic zod
        date-fns lucide-react framer-motion html-to-image

The files in prisma/ and lib/ are already written — do not modify them.
Wire up prisma, run the migration, run the seed.
Then create app/layout.tsx with the design tokens from CLAUDE.md as CSS variables
and a Tailwind theme extension mapping them to semantic names
(bg-paper, text-ink, border-line, bg-sea, bg-mango, bg-sun, bg-ok…).

Verify: `npm run dev` serves a page, and `npx tsx prisma/seed.ts` prints
"Day 3 (Wed 9 Sep) is deliberately broken".
```

---

## 1 · The primitives — build these before any screen

```
Read CLAUDE.md.

Build the five core components in components/:
- BlockCard.tsx      variants: default | warn | done | ghost
- LoadBar.tsx        three segments + monospace key underneath
- Companion.tsx      sun card, avatar, bold line + one line, up to 2 buttons
- Chip.tsx           neutral | sea | mango | ok
- PhotoChoiceCard.tsx  image tile + label + description, selected ring

Then components/TripShell.tsx: the tab bar (Overview, Plan, Explore, Inbox,
Vault, Money, Story), a user-switcher dropdown reading lib/session.ts, and a
settings gear.

Build a /kitchen-sink route rendering every component in every variant with real
data from the seed. I want to look at it before we build screens.
```

> Look at `/kitchen-sink` properly. Every screen after this inherits whatever you
> accept here. Fixing the visual language now costs minutes; fixing it at screen
> ten costs an hour.

---

## 2 · `/trip/[id]/plan` — build the brain's screen first

```
Read CLAUDE.md and SPEC.md section 8.

Build /trip/[id]/plan.

Data: Block rows for this trip, grouped by date. Trip.party for the pace budget.
Logic: call analyseDay() from lib/feasibility.ts. DO NOT reimplement any of it and
DO NOT call an AI to judge feasibility.

Layout: day tabs; vertical timeline of BlockCard with a monospace time gutter;
right rail on desktop / bottom sheet on mobile containing LoadBar, slack readout,
the warning list, and a "Fix this day" button.

Warnings render as chips on the offending BlockCard, not as a toast.
Empty slots render as ghost BlockCards with a "what should we do here?" action.

Reordering is a Server Action; analyseDay re-runs client-side and instantly.

Day 3 of the seeded trip must show 2 errors and 3 warnings. Show me a screenshot.
```

## 3 · `/trip/[id]` Overview

```
Read SPEC.md section 5. Build /trip/[id].
Cover, dates, member avatars, a day strip with a LoadBar per day (analyseTrip()),
budget vs actual from Expense rows, and a next-up card.
Reuse BlockCard and LoadBar. Links to Bookings and Packing.
```

## 4 · `/trip/[id]/today`

```
Read SPEC.md section 11. Build /trip/[id]/today.

Default tab when trip.status === "ACTIVE".
Morning Companion card: weather (lib/weather.ts), who's doing what, and the
CURRENT USER'S wake-up time derived from the first block where block.attendees
includes them (empty attendees === everyone). Include the reason.

Now / next / later BlockCards with member avatars, telUrl() call button,
mapsUrl() button, and check-off (Server Action -> status DONE).

Temporarily set the seeded trip to ACTIVE so I can see it.
```

## 5 · The AI layer + Settings

```
Read CLAUDE.md. lib/ai.ts, lib/crypto.ts, lib/providers.ts already exist —
do not modify them.

Build /settings: provider + model dropdowns from PROVIDERS, free-tier chips,
masked key field showing apiKeyHint, "Test & Save" calling testConnection()
BEFORE storing, and a Remove key button.

Then the usage meter from SPEC.md section 16: progress ring of today's requests
against the provider's daily cap (Gemini free = 1500), tokens, estimated cost,
cache-hit rate, by-feature breakdown from AiUsage. Warning banner at 80%.
```

## 6 · The funnel

```
Read SPEC.md sections 1-4. Build in one session:
  /                     landing, two PhotoChoiceCards + settings gear
  /plan/interests       six interest cards + the optional free-text box
  /plan/details         scope segmented control, party builder, location field
                        (4 states, lib/location.ts, NEVER on mount), dates,
                        transport cards, budget with "Go wild", diet chips
  /plan/destinations    5 results, top one large, weather verdict chips

suggestDestinations via askAI(). System prompt MUST forbid generic praise —
every reason must cite something the traveller said or a hard fact.
Enrich each result with weatherFor() before rendering.
Apply scope as a CONSTRAINT INSIDE THE PROMPT, never as a filter on results.

Handle all three AI states from CLAUDE.md.
```

## 7 · Inbox + the webhook

```
Read SPEC.md section 9. Build /trip/[id]/inbox and app/api/inbound/route.ts.

Webhook: verify a token, map the inbound address to a tripId, store a raw Ingest,
return 200 IMMEDIATELY. Do not extract here.

Screen: the trip's address with a copy button; a paste textarea; an image drop zone;
a "Connect Gmail" button that drops the seeded sample emails in (demo).

On load, extract any Ingest with status "pending" via askAI() — this is the lazy
step, there is no queue. Render review cards with confidence; below 0.7 is mango and
editable. "Add" writes Blocks. Nothing applies silently.

Extraction schema must include confirmationNumber, phone, address, checkIn/Out,
cancelBy, flightNumber, terminal, gate, seat, hostName, wifi.
```

## 8 · Vault

```
Read SPEC.md section 10. Build /trip/[id]/vault.
A view over Block.meta grouped by day. Tap-to-call, tap-to-copy, tap-to-map.
Search across every field. Mango row for any cancelBy within 72 hours.
"Add anything" links to the inbox. "Download PDF" via window.print() and a print
stylesheet — the simplest thing that works offline.
```

## 9 · Money

```
Read SPEC.md section 12. Build /trip/[id]/money.
balances() and settle() from lib/settle.ts — do not reimplement.
Balance rows, then "Settle up in N payments". Add-expense sheet with equal split
and per-person exclusion, optionally attached to a Block.
The seeded trip has 12 expenses; the headline must read "Settle up in 4 payments".
```

## 10 · Explore

```
Read SPEC.md section 7. Build /trip/[id]/explore.
suggestPlaces via askAI(), cached, persisted as Candidate rows.
Filter chips with the diet filter pre-applied and labelled "VEGETARIAN · N HIDDEN".
Each card: distance from the lodging block, external link, mapsUrl pin, vote count.
Voting toggles the current user in candidate.votes.
Allergy and mobility flags as mango chips.
"Add to a day" writes a Block and re-runs analyseDay.
```

## 11 · buildItinerary + the repair loop

```
Read SPEC.md section 8.
Server Action generateItinerary(tripId):
  1. askAI buildItinerary with trip, party, and candidates ordered by vote count
  2. analyseDay() on every day
  3. if ANY day has error-level warnings -> ONE fixDay call with those warnings
  4. re-validate, persist Blocks, revalidatePath
The user must never see the pre-repair version. Log both to the console so I can
see the loop worked.
```

## 12 · Story + public share

```
Read SPEC.md sections 13-14.
components/TripStory.tsx with mode="plan" | "memories".
SVG route line animated with stroke-dashoffset; day nodes staggered via
framer-motion; stats counting up. Fullscreen overlay with play/replay.
/t/[shareId]: read-only, no nav, respects trip.shareLevel — "itinerary" hides
every confirmation number and phone.
Poster: html-to-image over a hidden 1080x1920 node.
No video encoding.
```

## 13 · Then, only if time remains

```
/trip/[id]/bookings   option cards linking out + "I booked it" -> inbox
/trip/[id]/packing    one AI call from weather + activities + party
Comments on blocks    a thread under BlockCard detail
Replan-from-here      "Not feeling it" -> recompute the remainder of today only
```

---

## When Claude Code goes wrong

| Symptom | Say this |
|---|---|
| It wants a new schema field | "The schema is frozen. Solve it with the existing fields or tell me why you can't." |
| It reimplements travel-time maths in a component | "Use analyseDay() from lib/feasibility.ts. Delete the duplicate." |
| It converts times to UTC | "All times are local 'HH:MM' strings. Revert that." |
| It adds a dependency | "No new dependencies. Use what's installed." |
| The screen looks different from the others | "Reuse BlockCard/Chip/LoadBar. Match /kitchen-sink." |
| It asks an AI whether a day is feasible | "Feasibility is deterministic. analyseDay() only." |

## The rhythm

```
new session → "read CLAUDE.md and SPEC.md" → one prompt above
→ look at the screen → fix or accept → git commit → new session
```

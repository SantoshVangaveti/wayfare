"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import type { ExtractResult } from "@/lib/ingest";
import { searchPlaces } from "@/lib/location";
// A plain number — the rest of that module is browser-only but never runs here.
import { MAX_UPLOAD_CHARS } from "@/lib/shrink-image";

// The shape the MODEL fills in. Deliberately flat and free of optionals:
// a nested object of thirteen nullable fields made Claude hang indefinitely
// (120s+, no response), while this returns in a few seconds. Unknown values
// come back as "" and are stripped below.
const DETAIL_KEYS = [
  "confirmationNumber", "phone", "address", "city", "checkIn", "checkOut",
  "cancelBy", "flightNumber", "airline", "terminal", "gate", "seat",
  "hostName", "wifi", "notes",
] as const;

const AiBlockSchema = z.object({
  type: z.enum([
    "FLIGHT", "TRAIN", "BUS", "FERRY",
    "LODGING", "ACTIVITY", "MEAL", "TRANSIT", "NOTE",
  ]),
  title: z.string(),
  subtitle: z.string().describe('one line of detail, "" if none'),
  date: z.string().describe("YYYY-MM-DD, destination-local"),
  startTime: z.string().describe('HH:MM 24h destination-local, "" if unknown'),
  endTime: z.string().describe('HH:MM, "" if unknown'),
  placeName: z.string().describe('"" if unknown'),
  details: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .describe(
      `operational facts, one per entry. key must be one of: ${DETAIL_KEYS.join(", ")}`,
    ),
});

const ExtractSchema = z.object({
  blocks: z.array(AiBlockSchema),
  confidence: z.number().min(0).max(1),
  sourceSummary: z.string().describe("one short line: what this document is"),
});

/** The stored/applied shape — details folded back into the meta object the
 *  Vault, Today and BlockCard already read. */
const BlockSchema = z.object({
  type: z.enum([
    "FLIGHT", "TRAIN", "BUS", "FERRY",
    "LODGING", "ACTIVITY", "MEAL", "TRANSIT", "NOTE",
  ]),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  date: z.string(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  placeName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  meta: z.record(z.string(), z.string()),
});

const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

function toStoredBlock(b: z.infer<typeof AiBlockSchema>) {
  const meta: Record<string, string> = {};
  for (const d of b.details ?? []) {
    const v = d?.value?.trim();
    if (d?.key && v) meta[d.key] = v;
  }
  const address = meta.address ?? null;
  return {
    type: b.type,
    title: b.title,
    subtitle: blank(b.subtitle),
    date: b.date,
    startTime: blank(b.startTime),
    endTime: blank(b.endTime),
    placeName: blank(b.placeName),
    address,
    meta,
  };
}

const EXTRACT_SYSTEM = `You turn raw travel bookings (forwarded emails, pasted
messages, screenshots) into scheduled itinerary blocks. Extract the OPERATIONAL
payload, not just time and place: confirmation number, phone, address,
check-in/check-out, cancellation deadline, flight number, terminal, gate, seat,
host name, wifi credentials. Rules:
- Times are "HH:MM" 24h destination-local. Dates are "YYYY-MM-DD".
- Resolve relative dates ("Wed 9th") against the trip dates you are given.
- Never invent a value. Leave unknown fields null.
- ALWAYS set "city" to the town or city this happens in (e.g. "Benaulim",
  "Kalpetta"), not the region or country. It is how the trip finds itself
  on a map.
- One block per thing-that-happens-at-a-time; a hotel stay is ONE block at
  check-in whose meta carries checkOut and cancelBy.
- confidence: your honest 0..1 — below 0.7 the user is shown an editable card.`;

export type ExtractActionResult =
  | { ok: true; parsed: ExtractResult }
  | { ok: false; reason: "no-key" | "quota" | "scanned" | "failed" };

/** Providers signal an exhausted allowance differently; all of them say 429. */
function isQuotaError(e: unknown): boolean {
  const s = String((e as { message?: string })?.message ?? e);
  return /429|quota|rate.?limit|RESOURCE_EXHAUSTED|exceeded/i.test(s);
}

export async function extractIngest(ingestId: string): Promise<ExtractActionResult> {
  const ingest = await prisma.ingest.findUnique({
    where: { id: ingestId },
    include: { trip: true },
  });
  if (!ingest) return { ok: false, reason: "failed" };
  if (ingest.parsed) return { ok: true, parsed: ingest.parsed as unknown as ExtractResult };

  const trip = ingest.trip;
  const context = trip
    ? `Trip: ${trip.destination}, ${format(trip.startDate, "yyyy-MM-dd")} to ${format(
        trip.endDate, "yyyy-MM-dd",
      )}.`
    : "";

  // rawImage holds a data URL for anything visual — a screenshot OR a PDF.
  // We read the PDF's own text layer here rather than shipping the document
  // to the model: it works on every provider, costs a fraction, and can't
  // hang the way the document path did.
  const isPdf = ingest.rawImage?.startsWith("data:application/pdf");
  let pdfText: string | null = null;
  if (isPdf && ingest.rawImage) {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const bytes = Buffer.from(
        ingest.rawImage.replace(/^data:application\/pdf;base64,/, ""),
        "base64",
      );
      const doc = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(doc, { mergePages: true });
      pdfText = String(text).trim();
    } catch (e) {
      console.error("pdf text extraction failed:", e);
    }
  }
  // A scanned PDF has no text layer — say so instead of guessing.
  if (isPdf && (!pdfText || pdfText.length < 20)) {
    return { ok: false, reason: "scanned" };
  }

  const attachment = ingest.rawImage && !isPdf ? { images: [ingest.rawImage] } : {};

  try {
    const parsed = await askAI({
      feature: "extractBlocks",
      system: EXTRACT_SYSTEM,
      prompt: `${context}\n\nRaw material:\n${
        pdfText ?? ingest.rawText ?? "(image only — read the attached screenshot)"
      }`,
      ...attachment,
      schema: ExtractSchema,
      cache: true,
      timeoutMs: 30_000,
    });
    const stored = {
      blocks: parsed.blocks.map(toStoredBlock),
      confidence: parsed.confidence,
      sourceSummary: parsed.sourceSummary,
    };
    await prisma.ingest.update({
      where: { id: ingestId },
      data: { parsed: stored as object, confidence: parsed.confidence },
    });
    return { ok: true, parsed: stored as unknown as ExtractResult };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    if (isQuotaError(e)) {
      console.error("extractBlocks hit the provider's rate limit");
      return { ok: false, reason: "quota" };
    }
    console.error("extractBlocks failed:", e);
    return { ok: false, reason: "failed" };
  }
}

/** Nothing is ever applied silently — this only runs from the review card. */
export async function applyIngest(
  ingestId: string,
  blocks: unknown,
  /** The trip the user is looking at — authoritative. An ingest can lose its
   *  own link (deleting a trip nulls it), and Add must still work. */
  tripId?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const parsedBlocks = z.array(BlockSchema).safeParse(blocks);
  if (!parsedBlocks.success) {
    console.error("applyIngest rejected blocks:", parsedBlocks.error.issues.slice(0, 3));
    return { ok: false, reason: "shape" };
  }
  const ingest = await prisma.ingest.findUnique({ where: { id: ingestId } });
  const targetTrip = tripId ?? ingest?.tripId;
  if (!ingest || !targetTrip) return { ok: false, reason: "no-trip" };

  const maxSort = await prisma.block.aggregate({
    where: { tripId: targetTrip },
    _max: { sortOrder: true },
  });
  let sort = (maxSort._max.sortOrder ?? 0) + 1;

  await prisma.$transaction([
    ...parsedBlocks.data.map((b) =>
      prisma.block.create({
        data: {
          tripId: targetTrip,
          date: new Date(`${b.date}T00:00:00.000Z`),
          startTime: b.startTime ?? null,
          endTime: b.endTime ?? null,
          type: b.type,
          title: b.title,
          subtitle: b.subtitle ?? null,
          placeName: b.placeName ?? null,
          address: b.address ?? null,
          status: "CONFIRMED",
          meta: JSON.parse(JSON.stringify(b.meta)),
          sortOrder: sort++,
        },
      }),
    ),
    prisma.ingest.update({ where: { id: ingestId }, data: { status: "applied" } }),
  ]);

  // An imported trip starts with no coordinates, which leaves Explore and the
  // itinerary builder with nothing to work from. The first booking that
  // carries a location teaches the trip where it is.
  const trip = await prisma.trip.findUnique({
    where: { id: targetTrip },
    select: {
      destLat: true, destLng: true, startDate: true, endDate: true, title: true,
    },
  });
  const tripTitle = trip?.title ?? "";
  if (trip && trip.destLat === 0 && trip.destLng === 0) {
    // A booking that already carries coordinates settles it outright.
    const located = await prisma.block.findFirst({
      where: { tripId: targetTrip, lat: { not: null }, lng: { not: null } },
    });
    if (located?.lat != null && located?.lng != null) {
      await prisma.trip.update({
        where: { id: targetTrip },
        data: { destLat: located.lat, destLng: located.lng },
      });
    } else {
      // Otherwise look the place up. Extraction gives names, not coordinates,
      // and without coordinates Explore and the itinerary builder are blind.
      // The geocoder knows towns, not hotels, so feed it the place-shaped
      // parts: the tail of an address, then the trip's own name.
      const tail = (s: string) =>
        s.split(",").map((p) => p.trim()).filter(Boolean).slice(-2);
      const MONTHS =
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
      const clues = [
        ...parsedBlocks.data.map((b) => b.meta?.city).filter(Boolean),
        ...parsedBlocks.data.flatMap((b) => (b.meta?.address ? tail(b.meta.address) : [])),
        ...tail(tripTitle),
        ...parsedBlocks.data.flatMap((b) => (b.placeName ? tail(b.placeName) : [])),
      ].filter((c): c is string => !!c && c.length > 2 && !MONTHS.test(c));

      // Where the traveller lives breaks ties: "Goa" matches a town in the
      // Philippines and Spain too, and a fuzzy hit even returns Genoa.
      const home = (await prisma.tripMember.findFirst({
        where: { tripId: targetTrip, role: "owner" },
        select: { user: { select: { homeCountry: true } } },
      }))?.user.homeCountry;

      for (const clue of clues) {
        const hits = await searchPlaces(clue).catch(() => []);
        const exact = hits.filter(
          (h) => h.name.toLowerCase() === clue.toLowerCase(),
        );
        const hit =
          exact.find((h) => home && h.countryCode === home) ?? exact[0];
        if (hit) {
          await prisma.trip.update({
            where: { id: targetTrip },
            data: {
              destLat: hit.lat,
              destLng: hit.lng,
              destination: `${hit.name}${hit.region ? `, ${hit.region}` : ""}`,
              destCountry: hit.countryCode,
            },
          });
          break;
        }
      }
    }
  }

  // Widen the trip's dates to cover anything that landed outside them —
  // otherwise an imported flight simply would not show on any day tab.
  const added = parsedBlocks.data
    .map((b) => new Date(`${b.date}T00:00:00.000Z`))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (trip && added.length) {
    const earliest = new Date(Math.min(...added.map((d) => d.getTime())));
    const latest = new Date(Math.max(...added.map((d) => d.getTime())));
    const data: { startDate?: Date; endDate?: Date } = {};
    if (earliest < trip.startDate) data.startDate = earliest;
    if (latest > trip.endDate) data.endDate = latest;
    if (data.startDate || data.endDate) {
      await prisma.trip.update({ where: { id: targetTrip }, data });
    }
  }

  revalidatePath(`/trip/${targetTrip}`, "layout");
  return { ok: true };
}

export async function rejectIngest(ingestId: string) {
  const ingest = await prisma.ingest.update({
    where: { id: ingestId },
    data: { status: "rejected" },
  });
  if (ingest.tripId) revalidatePath(`/trip/${ingest.tripId}/inbox`);
}

export async function createTextIngest(tripId: string, rawText: string) {
  if (!rawText.trim()) return;
  await prisma.ingest.create({
    data: { tripId, sourceType: "text", rawText: rawText.trim(), status: "pending" },
  });
  revalidatePath(`/trip/${tripId}/inbox`);
}

/** Screenshots and PDFs both arrive here as data URLs. Screenshots are shrunk
 *  in the browser first (lib/shrink-image.ts) — one that somehow arrives
 *  oversized anyway is refused with a reason the Inbox can show, rather than
 *  vanishing into the request body limit. PDFs go up untouched. */
export async function createImageIngest(
  tripId: string,
  dataUrl: string,
): Promise<{ ok: true } | { ok: false; reason: "shape" | "too-big" }> {
  const isImage = dataUrl.startsWith("data:image/");
  const isPdf = dataUrl.startsWith("data:application/pdf");
  if (!isImage && !isPdf) return { ok: false, reason: "shape" };
  if (isImage && dataUrl.length > MAX_UPLOAD_CHARS) {
    return { ok: false, reason: "too-big" };
  }
  await prisma.ingest.create({
    data: {
      tripId,
      sourceType: isPdf ? "pdf" : "screenshot",
      rawImage: dataUrl,
      status: "pending",
    },
  });
  revalidatePath(`/trip/${tripId}/inbox`);
  return { ok: true };
}

/** The "Connect Gmail" demo door: drops a realistic sample email in. */
export async function addSampleEmail(tripId: string) {
  await prisma.ingest.create({
    data: {
      tripId,
      sourceType: "email",
      status: "pending",
      rawText: `---------- Forwarded message ----------
From: bookings@wayanadkayak.in
Subject: Confirmed — Kayak session KAY-2211

Hi Maya, your kayaking session at Banasura Sagar is confirmed.
  Date       Thu 10 Sep 2026, 15:30 - 17:00
  Party      2 adults, 2 children (life jackets provided)
  Amount     INR 1,800 (paid)
  Meet       Kayak Centre jetty, Banasura Sagar Dam
  Contact    +91 98470 55221 (Anoop)
Please arrive 15 minutes early.`,
    },
  });
  revalidatePath(`/trip/${tripId}/inbox`);
}

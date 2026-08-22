"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { askAI, AiNotConfigured } from "@/lib/ai";
import type { ExtractResult } from "@/lib/ingest";

const MetaSchema = z.object({
  confirmationNumber: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  checkIn: z.string().nullish(),
  checkOut: z.string().nullish(),
  cancelBy: z.string().nullish(),
  flightNumber: z.string().nullish(),
  terminal: z.string().nullish(),
  gate: z.string().nullish(),
  seat: z.string().nullish(),
  hostName: z.string().nullish(),
  wifi: z.string().nullish(),
  notes: z.string().nullish(),
});

const BlockSchema = z.object({
  type: z.enum([
    "FLIGHT", "TRAIN", "BUS", "FERRY",
    "LODGING", "ACTIVITY", "MEAL", "TRANSIT", "NOTE",
  ]),
  title: z.string(),
  subtitle: z.string().nullish(),
  date: z.string().describe("YYYY-MM-DD, destination-local"),
  startTime: z.string().nullish().describe("HH:MM, 24h, destination-local"),
  endTime: z.string().nullish(),
  placeName: z.string().nullish(),
  address: z.string().nullish(),
  meta: MetaSchema,
});

const ExtractSchema = z.object({
  blocks: z.array(BlockSchema),
  confidence: z.number().min(0).max(1),
  sourceSummary: z.string().describe("one short line: what this document is"),
});

const EXTRACT_SYSTEM = `You turn raw travel bookings (forwarded emails, pasted
messages, screenshots) into scheduled itinerary blocks. Extract the OPERATIONAL
payload, not just time and place: confirmation number, phone, address,
check-in/check-out, cancellation deadline, flight number, terminal, gate, seat,
host name, wifi credentials. Rules:
- Times are "HH:MM" 24h destination-local. Dates are "YYYY-MM-DD".
- Resolve relative dates ("Wed 9th") against the trip dates you are given.
- Never invent a value. Leave unknown fields null.
- One block per thing-that-happens-at-a-time; a hotel stay is ONE block at
  check-in whose meta carries checkOut and cancelBy.
- confidence: your honest 0..1 — below 0.7 the user is shown an editable card.`;

export type ExtractActionResult =
  | { ok: true; parsed: ExtractResult }
  | { ok: false; reason: "no-key" | "failed" };

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

  try {
    const parsed = await askAI({
      feature: "extractBlocks",
      system: EXTRACT_SYSTEM,
      prompt: `${context}\n\nRaw material:\n${ingest.rawText ?? "(image only — read the attached screenshot)"}`,
      images: ingest.rawImage ? [ingest.rawImage] : undefined,
      schema: ExtractSchema,
      cache: true,
    });
    await prisma.ingest.update({
      where: { id: ingestId },
      data: { parsed: parsed as object, confidence: parsed.confidence },
    });
    return { ok: true, parsed: parsed as ExtractResult };
  } catch (e) {
    if (e instanceof AiNotConfigured) return { ok: false, reason: "no-key" };
    console.error("extractBlocks failed:", e);
    return { ok: false, reason: "failed" };
  }
}

/** Nothing is ever applied silently — this only runs from the review card. */
export async function applyIngest(
  ingestId: string,
  blocks: unknown,
): Promise<{ ok: boolean }> {
  const parsedBlocks = z.array(BlockSchema).safeParse(blocks);
  const ingest = await prisma.ingest.findUnique({ where: { id: ingestId } });
  if (!parsedBlocks.success || !ingest?.tripId) return { ok: false };

  const maxSort = await prisma.block.aggregate({
    where: { tripId: ingest.tripId },
    _max: { sortOrder: true },
  });
  let sort = (maxSort._max.sortOrder ?? 0) + 1;

  await prisma.$transaction([
    ...parsedBlocks.data.map((b) =>
      prisma.block.create({
        data: {
          tripId: ingest.tripId!,
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

  revalidatePath(`/trip/${ingest.tripId}`, "layout");
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

export async function createImageIngest(tripId: string, dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return;
  await prisma.ingest.create({
    data: { tripId, sourceType: "screenshot", rawImage: dataUrl, status: "pending" },
  });
  revalidatePath(`/trip/${tripId}/inbox`);
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

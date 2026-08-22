// Postmark inbound webhook. Stores raw material and returns 200 immediately —
// extraction is lazy and happens when the Inbox screen loads (no queue).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const token = process.env.INBOUND_TOKEN;
  const url = new URL(req.url);
  if (token && url.searchParams.get("token") !== token) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const to = String(payload.OriginalRecipient ?? payload.To ?? "").toLowerCase();
  const text = String(payload.TextBody ?? payload.HtmlBody ?? "");
  const trip = to
    ? await prisma.trip.findFirst({ where: { inboundAddress: to } })
    : null;

  await prisma.ingest
    .create({
      data: {
        tripId: trip?.id,
        sourceType: "email",
        rawText: `From: ${payload.From ?? "unknown"}\nSubject: ${payload.Subject ?? ""}\n\n${text}`,
        status: "pending",
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

"use client";

// The import path: name + dates only. Everything else arrives via the Inbox.

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createImportedTrip } from "@/app/plan/actions";

export default function NewTripPage() {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pending, startTransition] = useTransition();
  const valid = title.trim() && startDate && endDate && startDate <= endDate;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 font-poppins text-lg font-bold tracking-tight text-sea"
      >
        <ArrowLeft className="size-4" /> Wayfare
      </Link>
      <div className="space-y-5">
        <div>
          <h1 className="font-poppins text-2xl font-bold tracking-tight">
            Name the trip
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            Then forward your bookings — the itinerary builds itself.
          </p>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Goa, December"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-sea"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:border-sea"
          />
          <span className="text-ink-3">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:border-sea"
          />
        </div>
        <button
          onClick={() =>
            startTransition(() =>
              createImportedTrip({ title: title.trim(), startDate, endDate }),
            )
          }
          disabled={!valid || pending}
          className="w-full rounded-xl bg-sea px-4 py-3 font-poppins text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Creating…" : "Create the trip"}
        </button>
      </div>
    </div>
  );
}

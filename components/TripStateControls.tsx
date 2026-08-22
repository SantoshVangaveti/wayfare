"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Play, RotateCcw } from "lucide-react";
import { setTripStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

export function TripStateControls({
  tripId,
  status,
}: {
  tripId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(next: "PLANNING" | "ACTIVE" | "COMPLETED", to: string) {
    startTransition(async () => {
      await setTripStatus(tripId, next);
      router.push(to);
      router.refresh();
    });
  }

  const btn =
    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-poppins text-xs font-semibold transition disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "PLANNING" && (
        <button
          onClick={() => go("ACTIVE", `/trip/${tripId}/today`)}
          disabled={pending}
          className={cn(btn, "border-sea bg-sea-soft text-sea hover:bg-sea hover:text-white")}
        >
          <Play className="size-3.5" /> Start the trip
        </button>
      )}
      {status === "ACTIVE" && (
        <>
          <button
            onClick={() => go("COMPLETED", `/trip/${tripId}/story`)}
            disabled={pending}
            className={cn(btn, "border-ok bg-ok-soft text-ok hover:bg-ok hover:text-white")}
          >
            <Flag className="size-3.5" /> Finish the trip
          </button>
          <button
            onClick={() => go("PLANNING", `/trip/${tripId}`)}
            disabled={pending}
            className={cn(btn, "border-line text-ink-3 hover:text-ink")}
          >
            <RotateCcw className="size-3.5" /> Back to planning
          </button>
        </>
      )}
      {status === "COMPLETED" && (
        <button
          onClick={() => go("PLANNING", `/trip/${tripId}`)}
          disabled={pending}
          className={cn(btn, "border-line text-ink-2 hover:border-sea hover:text-sea")}
        >
          <RotateCcw className="size-3.5" /> Reopen planning
        </button>
      )}
    </div>
  );
}

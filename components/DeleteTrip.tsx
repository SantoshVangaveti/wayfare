"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTrip } from "@/app/actions";
import { cn } from "@/lib/utils";

export function DeleteTrip({ tripId, title }: { tripId: string; title: string }) {
  const [arming, setArming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      {arming && (
        <span className="text-xs text-ink-3">
          Deletes {title} and everything in it — no undo.
        </span>
      )}
      <button
        onClick={() =>
          arming
            ? startTransition(() => deleteTrip(tripId))
            : setArming(true)
        }
        onBlur={() => setArming(false)}
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-poppins text-xs font-semibold transition",
          arming
            ? "border-mango bg-mango text-white"
            : "border-line text-ink-3 hover:border-mango hover:text-mango",
          pending && "opacity-50",
        )}
      >
        <Trash2 className="size-3.5" />
        {pending ? "Deleting…" : arming ? "Really delete this trip" : "Delete trip"}
      </button>
    </div>
  );
}

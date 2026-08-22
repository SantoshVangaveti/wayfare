import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";

/** The Companion speaks in sun. One card on screen at a time, two lines
 *  maximum, up to two small buttons — pass them via `actions`. */
export function Companion({
  headline,
  message,
  actions,
  className,
}: {
  headline: string;
  message?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-sun/40 bg-sun-soft p-4",
        className,
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sun text-white shadow-sm">
        <Compass className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="font-poppins text-sm font-semibold tracking-tight text-ink">
          {headline}
        </div>
        {message && <div className="mt-0.5 text-sm text-ink-2">{message}</div>}
        {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

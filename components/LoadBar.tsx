import { fmtDur } from "@/lib/feasibility";
import { cn } from "@/lib/utils";

/** Three segments: teal = active, mango = travel, grey = slack.
 *  Always keyed beneath in monospace — the key is part of the component. */
export function LoadBar({
  activeMin,
  travelMin,
  slackMin,
  showKey = true,
  className,
}: {
  activeMin: number;
  travelMin: number;
  slackMin: number;
  showKey?: boolean;
  className?: string;
}) {
  const total = Math.max(1, activeMin + travelMin + slackMin);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-paper-2">
        <div className="bg-sea" style={{ width: pct(activeMin) }} />
        <div className="bg-mango" style={{ width: pct(travelMin) }} />
        <div className={cn(slackMin > 0 && "bg-line")} style={{ width: pct(slackMin) }} />
      </div>
      {showKey && (
        <div className="mt-1.5 font-mono text-[11px] text-ink-3">
          {fmtDur(activeMin)} active · {fmtDur(travelMin)} travel · {fmtDur(slackMin)} slack
        </div>
      )}
    </div>
  );
}

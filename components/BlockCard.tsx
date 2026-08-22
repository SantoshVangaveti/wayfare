import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BlockCardVariant = "default" | "warn" | "done" | "ghost";

/** The one way a block renders, everywhere. Grid: monospace time gutter (fixed
 *  width) · title + one line of detail · right-hand chip. Extra content
 *  (warning chips, action buttons) goes in children, below the subtitle. */
export function BlockCard({
  variant = "default",
  startTime,
  endTime,
  title,
  subtitle,
  chip,
  children,
  className,
}: {
  variant?: BlockCardVariant;
  startTime?: string | null;
  endTime?: string | null;
  title: string;
  subtitle?: string | null;
  chip?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3.5rem_1fr_auto] items-start gap-3 rounded-xl border bg-surface p-4 shadow-sm",
        variant === "default" && "border-line",
        variant === "warn" && "border-mango bg-mango-soft/40",
        variant === "done" && "border-sea",
        variant === "ghost" &&
          "border-dashed border-line-2 bg-transparent shadow-none",
        className,
      )}
    >
      <div className="pt-0.5 font-mono text-xs leading-5 text-ink-3">
        {startTime ? (
          <>
            <div className="font-medium text-ink-2">{startTime}</div>
            {endTime && <div>{endTime}</div>}
          </>
        ) : (
          <div aria-hidden>—</div>
        )}
      </div>
      <div className="min-w-0">
        <div
          className={cn(
            "flex items-center gap-1.5 font-poppins text-sm font-semibold tracking-tight",
            variant === "ghost" ? "text-ink-3" : "text-ink",
          )}
        >
          {variant === "done" && <Check className="size-4 shrink-0 text-sea" />}
          <span className="truncate">{title}</span>
        </div>
        {subtitle && (
          <div className="mt-0.5 truncate text-sm text-ink-2">{subtitle}</div>
        )}
        {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
      </div>
      {chip && <div className="pt-0.5">{chip}</div>}
    </div>
  );
}

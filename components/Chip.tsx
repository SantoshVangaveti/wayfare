import { cn } from "@/lib/utils";

export type ChipVariant = "neutral" | "sea" | "mango" | "ok";

const styles: Record<ChipVariant, string> = {
  neutral: "bg-paper-2 text-ink-2",
  sea: "bg-sea-soft text-sea",
  mango: "bg-mango-soft text-mango",
  ok: "bg-ok-soft text-ok",
};

export function Chip({
  variant = "neutral",
  className,
  children,
}: {
  variant?: ChipVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

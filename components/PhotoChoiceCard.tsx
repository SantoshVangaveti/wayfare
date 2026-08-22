"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhotoChoiceCard({
  image,
  label,
  description,
  selected = false,
  onSelect,
  className,
}: {
  image: string;
  label: string;
  description?: string;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border-2 text-left shadow-sm transition",
        selected
          ? "border-sea ring-4 ring-sea-soft"
          : "border-transparent hover:border-line-2",
        className,
      )}
    >
      <div className="relative h-28 w-full sm:h-36">
        <Image
          src={image}
          alt={label}
          fill
          sizes="(max-width: 640px) 50vw, 300px"
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="font-poppins text-sm font-semibold tracking-tight text-white">
          {label}
        </div>
        {description && (
          <div className="mt-0.5 line-clamp-1 text-xs text-white/85">
            {description}
          </div>
        )}
      </div>
      {selected && (
        <div className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-sea text-white shadow">
          <Check className="size-4" />
        </div>
      )}
    </button>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function TabBar({ tabs }: { tabs: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 font-poppins text-sm font-semibold tracking-tight transition-colors",
              active
                ? "border-sea text-sea"
                : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

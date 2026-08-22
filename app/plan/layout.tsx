import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-poppins text-lg font-bold tracking-tight text-sea"
        >
          <ArrowLeft className="size-4" /> Wayfare
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="rounded-lg p-2 text-ink-3 hover:bg-paper-2 hover:text-ink"
        >
          <Settings className="size-5" />
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

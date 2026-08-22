"use client";

import { Printer } from "lucide-react";

export function PrintTrigger() {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-2.5 print:hidden">
      <span className="text-sm text-ink-2">
        Everything below fits on paper — choose{" "}
        <strong className="font-poppins">Save as PDF</strong> as the destination.
      </span>
      <button
        onClick={() => window.print()}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sea px-3 py-2 font-poppins text-xs font-semibold text-white"
      >
        <Printer className="size-3.5" /> Save as PDF
      </button>
    </div>
  );
}

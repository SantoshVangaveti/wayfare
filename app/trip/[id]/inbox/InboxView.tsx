"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Copy, ImagePlus, Inbox, Loader2, Mail, MessageSquareText, X,
} from "lucide-react";
import type { ExtractedBlock, IngestView } from "@/lib/ingest";
import { Chip } from "@/components/Chip";
import { Companion } from "@/components/Companion";
import { cn } from "@/lib/utils";
import {
  addSampleEmail, applyIngest, createImageIngest, createTextIngest,
  extractIngest, rejectIngest,
} from "./actions";

type CardState = "idle" | "reading" | "failed" | "no-key";

export function InboxView({
  tripId,
  inboundAddress,
  ingests: initial,
}: {
  tripId: string;
  inboundAddress: string | null;
  ingests: IngestView[];
}) {
  const router = useRouter();
  const [ingests, setIngests] = useState(initial);
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const extractingRef = useRef(false);

  useEffect(() => setIngests(initial), [initial]);

  // Lazy extraction: any pending ingest without a parse gets read when the
  // screen loads. Serial, so a free-tier key is never hammered.
  useEffect(() => {
    if (extractingRef.current) return;
    const todo = ingests.filter((g) => g.status === "pending" && !g.parsed);
    if (!todo.length) return;
    extractingRef.current = true;
    (async () => {
      for (const g of todo) {
        setStates((s) => ({ ...s, [g.id]: "reading" }));
        const res = await extractIngest(g.id);
        if (res.ok) {
          setIngests((list) =>
            list.map((x) =>
              x.id === g.id
                ? { ...x, parsed: res.parsed, confidence: res.parsed.confidence }
                : x,
            ),
          );
          setStates((s) => ({ ...s, [g.id]: "idle" }));
        } else {
          setStates((s) => ({ ...s, [g.id]: res.reason === "no-key" ? "no-key" : "failed" }));
        }
      }
      extractingRef.current = false;
    })();
  }, [ingests]);

  function copyAddress() {
    if (!inboundAddress) return;
    navigator.clipboard.writeText(inboundAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function onPaste() {
    const text = pasteText;
    setPasteText("");
    startTransition(async () => {
      await createTextIngest(tripId, text);
      router.refresh();
    });
  }

  const MAX_MB = 6;

  function onFile(file: File | undefined) {
    if (!file) return;
    setFileNote(null);

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    // .txt, .eml, .ics and friends: read the text and treat it as a paste.
    const isText =
      file.type.startsWith("text/") ||
      file.type === "message/rfc822" ||
      /\.(txt|eml|ics|md)$/i.test(file.name);

    if (!isImage && !isPdf && !isText) {
      setFileNote(
        `${file.name} isn't something I can read — try a PDF, a screenshot, or paste the text.`,
      );
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFileNote(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the ${MAX_MB} MB limit. Send the key page instead.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      startTransition(async () => {
        if (isText) await createTextIngest(tripId, result);
        else await createImageIngest(tripId, result);
        router.refresh();
      });
    };
    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  }

  const open = ingests.filter((g) => g.status === "pending");
  const handled = ingests.filter((g) => g.status !== "pending");

  return (
    <div className="space-y-6">
      {/* the trip's own address */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-sm text-ink-2">
          Forward any booking to this trip's address — it becomes a scheduled
          block with its confirmation number attached.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-paper-2 px-3 py-1.5 font-mono text-sm text-ink">
            {inboundAddress ?? "no address yet"}
          </code>
          <button
            onClick={copyAddress}
            className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
          >
            {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* three doors */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 font-poppins text-sm font-semibold">
            <MessageSquareText className="size-4 text-sea" /> Paste a message
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Hi Maya — jeep confirmed for Wed 9th, 6am sharp…"
            rows={3}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sea"
          />
          <button
            onClick={onPaste}
            disabled={!pasteText.trim() || pending}
            className="mt-2 w-full rounded-lg bg-sea px-3 py-2 font-poppins text-xs font-semibold text-white disabled:opacity-40"
          >
            Read it
          </button>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 transition",
            dragging
              ? "border-sea bg-sea-soft text-sea"
              : "border-line-2 text-ink-3 hover:border-sea hover:text-sea",
          )}
        >
          <ImagePlus className="size-6" />
          <span className="font-poppins text-sm font-semibold">
            Drop a PDF or screenshot
          </span>
          <span className="text-xs">tickets, vouchers, confirmations</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,text/plain,message/rfc822,.eml,.ics,.txt"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </button>

        <button
          onClick={() =>
            startTransition(async () => {
              await addSampleEmail(tripId);
              router.refresh();
            })
          }
          disabled={pending}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-4 text-ink-2 transition hover:border-sea hover:text-sea"
        >
          <Mail className="size-6" />
          <span className="font-poppins text-sm font-semibold">Connect Gmail</span>
          <span className="text-xs">drops a sample email in (demo)</span>
        </button>
      </div>

      {fileNote && (
        <p className="rounded-xl border border-mango bg-mango-soft px-3 py-2 text-sm text-mango">
          {fileNote}
        </p>
      )}

      {/* review cards */}
      {open.length === 0 && handled.length === 0 && (
        <Companion
          headline="Nothing waiting."
          message="Forward, paste, or drop something — it lands here as a review card."
        />
      )}

      {open.map((g) => (
        <ReviewCard
          key={g.id}
          ingest={g}
          state={states[g.id] ?? (g.parsed ? "idle" : "reading")}
          onRetry={() => {
            setStates((s) => ({ ...s, [g.id]: "reading" }));
            startTransition(async () => {
              const res = await extractIngest(g.id);
              if (res.ok) {
                setIngests((list) =>
                  list.map((x) =>
                    x.id === g.id
                      ? { ...x, parsed: res.parsed, confidence: res.parsed.confidence }
                      : x,
                  ),
                );
                setStates((s) => ({ ...s, [g.id]: "idle" }));
              } else {
                setStates((s) => ({ ...s, [g.id]: res.reason === "no-key" ? "no-key" : "failed" }));
              }
            });
          }}
          onApply={(blocks) =>
            startTransition(async () => {
              const res = await applyIngest(g.id, blocks);
              if (res.ok) {
                setIngests((list) =>
                  list.map((x) => (x.id === g.id ? { ...x, status: "applied" } : x)),
                );
                router.refresh();
              }
            })
          }
          onReject={() =>
            startTransition(async () => {
              await rejectIngest(g.id);
              setIngests((list) =>
                list.map((x) => (x.id === g.id ? { ...x, status: "rejected" } : x)),
              );
            })
          }
        />
      ))}

      {handled.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-poppins text-sm font-bold tracking-tight text-ink-3">
            Handled
          </h2>
          {handled.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-3"
            >
              {g.status === "applied" ? (
                <Check className="size-4 text-ok" />
              ) : (
                <X className="size-4 text-ink-3" />
              )}
              <span className="truncate">
                {g.parsed?.sourceSummary ?? g.preview ?? g.sourceType}
              </span>
              <Chip variant={g.status === "applied" ? "ok" : "neutral"} className="ml-auto">
                {g.status}
              </Chip>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ReviewCard({
  ingest,
  state,
  onApply,
  onReject,
  onRetry,
}: {
  ingest: IngestView;
  state: CardState;
  onApply: (blocks: ExtractedBlock[]) => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const parsed = ingest.parsed;
  const [blocks, setBlocks] = useState<ExtractedBlock[] | null>(parsed?.blocks ?? null);
  useEffect(() => setBlocks(parsed?.blocks ?? null), [parsed]);

  if (state === "reading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-ink-2">
        <Loader2 className="size-4 animate-spin text-sea" />
        <span className="text-sm">Reading{ingest.hasImage ? " the screenshot" : ""}…</span>
        <span className="ml-auto truncate font-mono text-xs text-ink-3">
          {ingest.preview}
        </span>
      </div>
    );
  }
  if (state === "no-key") {
    return (
      <Companion
        headline="No AI key yet."
        message="Add one in Settings and this card will read itself."
      />
    );
  }
  if (state === "failed" || !parsed || !blocks) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <Inbox className="size-4 text-ink-3" />
        <span className="text-sm text-ink-2">Couldn't read this one.</span>
        <button
          onClick={onRetry}
          className="ml-auto rounded-lg border border-line px-3 py-1.5 font-poppins text-xs font-semibold text-ink-2 hover:bg-paper-2"
        >
          Try again
        </button>
      </div>
    );
  }

  const low = parsed.confidence < 0.7;
  const pct = Math.round(parsed.confidence * 100);

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border bg-surface p-4 shadow-sm",
        low ? "border-mango" : "border-line",
      )}
    >
      <div className="flex items-center gap-2">
        <Mail className="size-4 shrink-0 text-sea" />
        <span className="truncate font-poppins text-sm font-semibold">
          {parsed.sourceSummary}
        </span>
        <Chip variant={low ? "mango" : "ok"} className="ml-auto">
          {pct}% sure
        </Chip>
      </div>

      {blocks.map((b, i) => {
        const metaEntries = Object.entries(b.meta ?? {}).filter(([, v]) => v);
        return (
          <div key={i} className="rounded-xl border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="sea">{b.type}</Chip>
              <input
                value={b.title}
                onChange={(e) =>
                  setBlocks((prev) =>
                    prev!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  )
                }
                className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-poppins text-sm font-semibold outline-none focus:border-sea focus:bg-surface"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
              <input
                type="date"
                value={b.date}
                onChange={(e) =>
                  setBlocks((prev) =>
                    prev!.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)),
                  )
                }
                className="rounded-lg border border-line bg-surface px-2 py-1 outline-none focus:border-sea"
              />
              <input
                type="time"
                value={b.startTime ?? ""}
                onChange={(e) =>
                  setBlocks((prev) =>
                    prev!.map((x, j) =>
                      j === i ? { ...x, startTime: e.target.value || null } : x,
                    ),
                  )
                }
                className="rounded-lg border border-line bg-surface px-2 py-1 outline-none focus:border-sea"
              />
              <span className="text-ink-3">–</span>
              <input
                type="time"
                value={b.endTime ?? ""}
                onChange={(e) =>
                  setBlocks((prev) =>
                    prev!.map((x, j) =>
                      j === i ? { ...x, endTime: e.target.value || null } : x,
                    ),
                  )
                }
                className="rounded-lg border border-line bg-surface px-2 py-1 outline-none focus:border-sea"
              />
            </div>
            {metaEntries.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {metaEntries.map(([k, v]) => (
                  <Chip key={k}>
                    {k}: {String(v)}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2">
        <button
          onClick={() => onApply(blocks)}
          className="flex-1 rounded-xl bg-sea px-4 py-2 font-poppins text-sm font-semibold text-white hover:opacity-90"
        >
          Add to the trip
        </button>
        <button
          onClick={onReject}
          className="rounded-xl border border-line px-4 py-2 font-poppins text-sm font-semibold text-ink-2 hover:bg-paper-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

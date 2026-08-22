// Public, read-only, no navigation, no login. Reached only by the unlisted
// link. shareLevel "itinerary" (default) hides every confirmation number and
// phone; "everything" is an explicit opt-in made on the Story screen.

import Image from "next/image";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { prisma } from "@/lib/db";
import { BlockCard } from "@/components/BlockCard";
import { Chip } from "@/components/Chip";

export const dynamic = "force-dynamic";

type Meta = Record<string, string | number | null | undefined>;

const SENSITIVE_LABELS: Record<string, string> = {
  confirmationNumber: "Confirmation",
  phone: "Phone",
  wifi: "Wi-Fi",
  seat: "Seat",
  seats: "Seats",
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const trip = await prisma.trip.findUnique({
    where: { shareId },
    include: { blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] } },
  });
  if (!trip) notFound();

  const everything = trip.shareLevel === "everything";

  const dates = [...new Set(trip.blocks.map((b) => b.date.toISOString().slice(0, 10)))].sort();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="relative mb-6 h-44 overflow-hidden rounded-2xl">
        {trip.coverImage && (
          <Image
            src={trip.coverImage}
            alt={trip.destination}
            fill
            priority
            sizes="(max-width: 672px) 100vw, 672px"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="font-poppins text-xl font-bold tracking-tight text-white">
            {trip.title}
          </h1>
          <div className="font-mono text-xs text-white/85">
            {format(trip.startDate, "d MMM")} – {format(trip.endDate, "d MMM yyyy")} ·{" "}
            {trip.destination}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {dates.map((date) => (
          <section key={date} className="space-y-2">
            <h2 className="font-poppins text-sm font-bold tracking-tight text-ink-2">
              {format(parseISO(date), "EEEE d MMMM")}
            </h2>
            {trip.blocks
              .filter((b) => b.date.toISOString().slice(0, 10) === date)
              .map((b) => {
                const meta = (b.meta as Meta) ?? {};
                const sensitive = everything
                  ? Object.entries(SENSITIVE_LABELS)
                      .filter(([k]) => meta[k])
                      .map(([k, label]) => [label, String(meta[k])] as const)
                  : [];
                return (
                  <BlockCard
                    key={b.id}
                    startTime={b.startTime}
                    endTime={b.endTime}
                    title={b.title}
                    subtitle={b.subtitle}
                    chip={<Chip>{b.type}</Chip>}
                  >
                    {sensitive.map(([label, value]) => (
                      <Chip key={label} variant="sea">
                        {label}: {value}
                      </Chip>
                    ))}
                  </BlockCard>
                );
              })}
          </section>
        ))}
      </div>

      <div className="mt-10 text-center font-mono text-xs text-ink-3">
        planned with Wayfare
      </div>
    </div>
  );
}

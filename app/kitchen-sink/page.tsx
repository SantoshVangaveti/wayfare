// Every core component in every variant, fed with real seed data.
// This page sets the visual language — every screen after it inherits this.

import { prisma } from "@/lib/db";
import { analyseDay } from "@/lib/feasibility";
import { toBlockLike } from "@/lib/blocks";
import type { Party } from "@/lib/types";
import { BlockCard } from "@/components/BlockCard";
import { LoadBar } from "@/components/LoadBar";
import { Companion } from "@/components/Companion";
import { Chip } from "@/components/Chip";
import { PhotoChoiceCard } from "@/components/PhotoChoiceCard";
import { TripShell } from "@/components/TripShell";

export const dynamic = "force-dynamic";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-poppins text-base font-bold tracking-tight text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function KitchenSink() {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: "trip_wayanad" },
    include: { blocks: { orderBy: [{ date: "asc" }, { sortOrder: "asc" }] } },
  });
  const party = trip.party as unknown as Party;

  const day2 = trip.blocks.filter(
    (b) => b.date.toISOString().slice(0, 10) === "2026-09-08",
  );
  const day3 = trip.blocks.filter(
    (b) => b.date.toISOString().slice(0, 10) === "2026-09-09",
  );

  const a2 = analyseDay(day2.map(toBlockLike), { tripStyle: "balanced", party });
  const a3 = analyseDay(day3.map(toBlockLike), { tripStyle: "balanced", party });

  const edakkal = day3.find((b) => b.title.includes("Edakkal"))!;
  const falls = day3.find((b) => b.title.includes("Soochipara"))!;
  const breakfast = day2.find((b) => b.title === "Breakfast")!;
  const lake = day2.find((b) => b.title.includes("Pookode"))!;

  const chipsFor = (blockId: string) =>
    a3.warnings.filter((w) => w.blockId === blockId);

  return (
    <TripShell tripId={trip.id} status={trip.status}>
      <div className="space-y-10">
        <div>
          <h1 className="font-poppins text-2xl font-bold tracking-tight">
            Kitchen sink
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            Every component, every variant, real seed data. Accept this page
            before building screens.
          </p>
        </div>

        <Section title="Chip — neutral · sea · mango · ok">
          <div className="flex flex-wrap gap-2">
            <Chip>Q8K2LM</Chip>
            <Chip variant="sea">6h 50m active</Chip>
            <Chip variant="mango">45m drive</Chip>
            <Chip variant="ok">Confirmed</Chip>
          </div>
        </Section>

        <Section title="BlockCard — default · warn (with real Day-3 warnings) · done · ghost">
          <div className="space-y-2">
            <BlockCard
              startTime={lake.startTime}
              endTime={lake.endTime}
              title={lake.title}
              subtitle={lake.subtitle}
              chip={<Chip variant="sea">₹600</Chip>}
            />
            <BlockCard
              variant="warn"
              startTime={edakkal.startTime}
              endTime={edakkal.endTime}
              title={edakkal.title}
              subtitle={edakkal.subtitle}
              chip={<Chip variant="mango">2 flags</Chip>}
            >
              {chipsFor(edakkal.id).map((w) => (
                <Chip key={w.code} variant="mango">
                  {w.message}
                </Chip>
              ))}
            </BlockCard>
            <BlockCard
              variant="warn"
              startTime={falls.startTime}
              endTime={falls.endTime}
              title={falls.title}
              subtitle={falls.subtitle}
              chip={<Chip variant="mango">Impossible</Chip>}
            >
              {chipsFor(falls.id).map((w) => (
                <Chip key={w.code} variant="mango">
                  {w.message}
                </Chip>
              ))}
            </BlockCard>
            <BlockCard
              variant="done"
              startTime={breakfast.startTime}
              endTime={breakfast.endTime}
              title={breakfast.title}
              subtitle={breakfast.subtitle}
              chip={<Chip variant="ok">Done</Chip>}
            />
            <BlockCard
              variant="ghost"
              title="What should we do here?"
              subtitle="Free afternoon — tap to explore ideas"
            />
          </div>
        </Section>

        <Section title="LoadBar — Day 2 (fine) vs Day 3 (broken)">
          <div className="space-y-5 rounded-xl border border-line bg-surface p-4">
            <div>
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">
                Tue 8 Sep · score {a2.score}
              </div>
              <LoadBar
                activeMin={a2.activeMin}
                travelMin={a2.travelMin}
                slackMin={a2.slackMin}
              />
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">
                Wed 9 Sep · score {a3.score}
              </div>
              <LoadBar
                activeMin={a3.activeMin}
                travelMin={a3.travelMin}
                slackMin={a3.slackMin}
              />
            </div>
          </div>
        </Section>

        <Section title="Companion">
          <Companion
            headline="Day 3 is a lot."
            message="Two things don't physically fit, and Edakkal is 250 steps for Amma. Want me to move something?"
            actions={
              <>
                <button className="rounded-lg bg-sea px-3 py-1.5 font-poppins text-xs font-semibold text-white">
                  Fix this day
                </button>
                <button className="rounded-lg border border-line bg-surface px-3 py-1.5 font-poppins text-xs font-semibold text-ink-2">
                  Show me
                </button>
              </>
            }
          />
        </Section>

        <Section title="PhotoChoiceCard — selected + default">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PhotoChoiceCard
              image="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=70"
              label="Mountains"
              description="Hills, mist, viewpoints"
              selected
            />
            <PhotoChoiceCard
              image="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=70"
              label="Beaches"
              description="Sand, surf, sunsets"
            />
            <PhotoChoiceCard
              image="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=70"
              label="Food"
              description="Markets, kitchens, thalis"
            />
          </div>
        </Section>

        <Section title="Monospace alignment check">
          <div className="w-64 rounded-xl border border-line bg-surface p-4 font-mono text-sm text-ink">
            <div className="flex justify-between"><span>06:00</span><span>₹2,400</span></div>
            <div className="flex justify-between"><span>11:00</span><span>₹800</span></div>
            <div className="flex justify-between"><span>14:00</span><span>₹900</span></div>
            <div className="flex justify-between"><span>17:30</span><span>₹1,200</span></div>
          </div>
        </Section>
      </div>
    </TripShell>
  );
}

import Image from "next/image";

/** A holiday wash behind the whole app: the destination's own imagery, sunk
 *  far enough under a paper gradient that every word stays readable. Fixed,
 *  so it sits still while content scrolls over it. */
export function AmbientBackdrop({ photo }: { photo: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* the destination itself, slowly drifting across the window */}
      <div className="wf-drift absolute inset-0">
        <Image
          src={photo}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-[0.45] blur-[2px]"
        />
      </div>
      {/* Paper wash. Content sits on opaque cards, so the gutters can carry a
          real scene; the middle band stays milky enough for headings that sit
          directly on the background. */}
      <div className="absolute inset-0 bg-gradient-to-b from-paper/25 via-paper/70 to-paper/85" />
      {/* two slow light sources, out of phase so they never pulse together */}
      <div className="wf-glow-a absolute inset-x-0 top-0 h-[55vh] bg-[radial-gradient(120%_100%_at_50%_0%,var(--color-sun-soft)_0%,transparent_70%)]" />
      <div className="wf-glow-b absolute inset-x-0 bottom-0 h-[45vh] bg-[radial-gradient(100%_100%_at_50%_100%,var(--color-sea-soft)_0%,transparent_70%)]" />
    </div>
  );
}

import Image from "next/image";

/** A holiday wash behind the whole app: the destination's own imagery, sunk
 *  far enough under a paper gradient that every word stays readable. Fixed,
 *  so it sits still while content scrolls over it. */
export function AmbientBackdrop({ photo }: { photo: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <Image
        src={photo}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-110 object-cover opacity-[0.07] blur-[6px]"
      />
      {/* paper wash — the photo only survives as a hint at the very top */}
      <div className="absolute inset-0 bg-gradient-to-b from-paper/60 via-paper/95 to-paper" />
      {/* a low warm sunrise glow: holiday feeling without a picture fighting text */}
      <div className="absolute inset-x-0 top-0 h-[45vh] bg-[radial-gradient(120%_100%_at_50%_0%,var(--color-sun-soft)_0%,transparent_70%)] opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-[35vh] bg-[radial-gradient(100%_100%_at_50%_100%,var(--color-sea-soft)_0%,transparent_70%)] opacity-50" />
    </div>
  );
}

import { Companion } from "./Companion";

/** Placeholder for screens not yet built — keeps navigation dead-end free. */
export function ComingSoon({ what }: { what: string }) {
  return (
    <Companion
      headline={`${what} is on its way.`}
      message="This screen is next on the build list — nothing is broken."
    />
  );
}

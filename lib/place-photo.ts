// Real photographs of real places, from Wikipedia/Wikimedia. Keyless, free,
// reusable-licensed. A stock library can only ever offer something that looks
// like the place — this returns the place itself, or nothing at all.

const WIKI = "https://en.wikipedia.org/w/api.php";

/** Wikipedia's lead image for the best-matching article, at a sane width.
 *  Returns null rather than a lookalike when there is no confident match. */
export async function placePhoto(
  name: string,
  context?: string,
): Promise<string | null> {
  const query = context ? `${name} ${context}` : name;
  const url =
    `${WIKI}?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1` +
    `&prop=pageimages&piprop=thumbnail&pithumbsize=1200`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Wayfare/1.0 (hackathon trip planner)" },
      // Photos of places don't change; cache hard so a screen costs one call.
      next: { revalidate: 60 * 60 * 24 * 30 },
      // A slow lookup must never hold a screen hostage — fall back instead.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const first = Object.values(pages)[0] as { thumbnail?: { source?: string } };
    return first?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/** Best photo for a day: try its headline place, then the destination. */
export async function dayPhoto(
  headline: string | undefined,
  destination: string,
): Promise<string | null> {
  if (headline) {
    // Strip a trailing ", Somewhere" so the search stays tight.
    const place = headline.split(" — ")[0].split(",")[0].trim();
    const hit = await placePhoto(place, destination.split(",")[0]);
    if (hit) return hit;
  }
  return placePhoto(destination);
}

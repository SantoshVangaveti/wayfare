// Curated imagery for the Story, chosen from what the day actually contains.
// Keyword-matched against block titles and tags — no API, no keys, no guessing
// at a URL that might 404 (every id below was checked live).

interface Theme {
  keys: string[];
  photo: string;
  tint: string; // gradient overlay, keeps text readable and days distinct
}

const THEMES: Theme[] = [
  { keys: ["falls", "waterfall", "cascade"],
    photo: "1432405972618-c60b0225b8f9", tint: "from-[#0C7C86] to-[#0F2530]" },
  { keys: ["safari", "wildlife", "sanctuary", "elephant", "jeep"],
    photo: "1549366021-9f761d450615", tint: "from-[#D25E18] to-[#0F2530]" },
  // Deliberately NOT a recognisable landmark: a stand-in that looks like a
  // famous place the traveller isn't visiting is worse than an abstract one.
  { keys: ["cave", "heritage", "temple", "fort", "museum", "church"],
    photo: "1563822249366-3efb23b8e0c9", tint: "from-[#6E8791] to-[#0F2530]" },
  { keys: ["tea", "estate", "plantation", "spice", "garden", "park", "bamboo"],
    photo: "1523920290228-4f321a939b4c", tint: "from-[#178A69] to-[#0F2530]" },
  { keys: ["lake", "dam", "boat", "kayak", "backwater"],
    photo: "1439066615861-d1af74d74000", tint: "from-[#0C7C86] to-[#0F2530]" },
  { keys: ["trek", "peak", "hike", "climb", "viewpoint", "hill", "mountain"],
    photo: "1506905925346-21bda4d32df4", tint: "from-[#3B5661] to-[#0F2530]" },
  { keys: ["beach", "sea", "coast", "ferry", "island"],
    photo: "1507525428034-b723cf961d3e", tint: "from-[#0C7C86] to-[#0F2530]" },
  { keys: ["flight", "airport", "train", "drive", "transfer", "road"],
    photo: "1436491865332-7a61a109cc05", tint: "from-[#3B5661] to-[#0F2530]" },
  { keys: ["breakfast", "lunch", "dinner", "restaurant", "cafe", "food", "meal"],
    photo: "1414235077428-338989a2e8c0", tint: "from-[#E5A017] to-[#0F2530]" },
  { keys: ["market", "shopping", "bazaar", "shop"],
    photo: "1488459716781-31db52582fe9", tint: "from-[#D25E18] to-[#0F2530]" },
  { keys: ["check in", "check out", "cabin", "resort", "homestay", "hotel", "stay"],
    photo: "1445019980597-93fa8acb246c", tint: "from-[#178A69] to-[#0F2530]" },
];

const FALLBACK: Theme = {
  keys: [],
  photo: "1469474968028-56623f02e42e",
  tint: "from-[#0C7C86] to-[#0F2530]",
};

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=75`;

/** Backdrop for the planning funnel, from the interests picked so far. */
export function themeForInterests(interests: string[]): string {
  const map: Record<string, string> = {
    mountains: "1506905925346-21bda4d32df4",
    beaches: "1507525428034-b723cf961d3e",
    city: "1480714378408-67cf0d13bc1b",
    nature: "1472214103451-9374bd1c798e",
    food: "1414235077428-338989a2e8c0",
    heritage: "1563822249366-3efb23b8e0c9",
  };
  return img(map[interests[0] ?? ""] ?? FALLBACK.photo, 1600);
}

/** Pick the image for a day from its own titles and tags. The first
 *  non-transit match wins, so a day is represented by what you DO on it. */
export function themeForDay(
  titles: string[],
  tags: string[] = [],
): { photo: string; tint: string } {
  const haystack = [...titles, ...tags].join(" ").toLowerCase();
  // Whole words only — "5 seats" must not match "sea".
  const hit = (k: string) =>
    new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(haystack);
  // A day is pictured by what you SAW, not by the fact that you ate or
  // travelled — those only win when nothing else happened.
  const scenic = THEMES.filter(
    (t) => !t.keys.includes("flight") && !t.keys.includes("breakfast"),
  );
  const match =
    scenic.find((t) => t.keys.some(hit)) ??
    THEMES.find((t) => t.keys.some(hit)) ??
    FALLBACK;
  return { photo: img(match.photo), tint: match.tint };
}

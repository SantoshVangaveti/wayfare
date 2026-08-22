// Geolocation with a manual path that is just as good.
// NEVER call detectLocation() on mount — only from a click. A denied
// permission is sticky, and browsers penalise unprompted requests.

export interface Place {
  name: string; region?: string; country: string; countryCode: string;
  lat: number; lng: number;
}

export function detectLocation(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return reject(new Error("unsupported"));
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try { resolve(await reverseGeocode(coords.latitude, coords.longitude)); }
        catch (e) { reject(e); }
      },
      () => reject(new Error("denied")),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  });
}

/** lat/lng -> place. Keyless, built for client-side use. */
export async function reverseGeocode(lat: number, lng: number): Promise<Place> {
  const r = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
  );
  if (!r.ok) throw new Error("reverse geocode failed");
  const d = await r.json();
  return {
    name: d.city || d.locality || d.principalSubdivision,
    region: d.principalSubdivision,
    country: d.countryName,
    countryCode: d.countryCode,
    lat, lng,
  };
}

/** Typed city -> places. Same provider as our weather. Keyless. */
export async function searchPlaces(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`,
  );
  if (!r.ok) return [];
  const d = await r.json();
  return (d.results ?? []).map((x: any) => ({
    name: x.name, region: x.admin1, country: x.country,
    countryCode: x.country_code, lat: x.latitude, lng: x.longitude,
  }));
}

/** If they're not where they live, flip the scope toggle and say so. */
export function inferScope(home?: string, dest?: string) {
  return home && dest && home !== dest ? "international" : "domestic";
}

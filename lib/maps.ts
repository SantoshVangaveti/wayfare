/** Deep links only — no Maps API key anywhere in this project.
 *
 *  Name + coordinates is the strongest form we can build without a Places
 *  key: it searches the name but anchors the map at the exact spot, so
 *  Google resolves it to that place rather than a same-named one elsewhere.
 *  Name alone still lands on the listing; bare coordinates only drop a pin. */
export function mapsUrl(lat?: number | null, lng?: number | null, name?: string): string {
  const hasCoords = lat != null && lng != null;
  if (name && hasCoords) {
    return `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},15z`;
  }
  if (name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  }
  if (hasCoords) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return "https://www.google.com/maps";
}
export function directionsUrl(
  from: { lat: number; lng: number }, to: { lat: number; lng: number },
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
}
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Deep links only — no Maps API key anywhere in this project. */
export function mapsUrl(lat?: number | null, lng?: number | null, name?: string): string {
  if (lat == null || lng == null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name ?? "")}`;
  }
  const q = `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}${name ? `&query_place_id=` : ""}`;
}
export function directionsUrl(
  from: { lat: number; lng: number }, to: { lat: number; lng: number },
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
}
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

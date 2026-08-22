/** Deep links only — no Maps API key anywhere in this project.
 *  A NAME search lands on the actual place listing (photos, reviews,
 *  directions); bare coordinates only as a fallback — they just drop a pin. */
export function mapsUrl(lat?: number | null, lng?: number | null, name?: string): string {
  if (name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  }
  if (lat == null || lng == null) {
    return `https://www.google.com/maps`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
export function directionsUrl(
  from: { lat: number; lng: number }, to: { lat: number; lng: number },
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
}
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

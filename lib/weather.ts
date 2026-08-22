// Open-Meteo. No API key, ever.
// Forecasts only reach ~16 days. Beyond that we must use climate averages,
// or the "monsoon" badge is a lie.

export type Verdict = "GOOD" | "MIXED" | "MONSOON" | "EXTREME_HEAT" | "COLD";
export interface WeatherRead {
  source: "forecast" | "climate";
  avgTempC: number; rainDays: number; summary: string; verdict: Verdict;
}

const daysUntil = (d: string) =>
  Math.round((new Date(`${d}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);

export async function weatherFor(
  lat: number, lng: number, startDate: string, endDate: string,
): Promise<WeatherRead> {
  return daysUntil(startDate) <= 16
    ? forecast(lat, lng, startDate, endDate)
    : climate(lat, lng, startDate, endDate);
}

async function forecast(lat: number, lng: number, s: string, e: string): Promise<WeatherRead> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${s}&end_date=${e}&timezone=auto`;
  const d = await (await fetch(u)).json();
  const max: number[] = d.daily.temperature_2m_max, pr: number[] = d.daily.precipitation_sum;
  const avg = max.reduce((a, b) => a + b, 0) / max.length;
  const rainDays = pr.filter((p) => p >= 1).length;
  return { source: "forecast", avgTempC: Math.round(avg), rainDays,
    summary: `${Math.round(avg)}°C, rain on ${rainDays} of ${max.length} days`,
    verdict: verdictOf(avg, rainDays, max.length) };
}

async function climate(lat: number, lng: number, s: string, e: string): Promise<WeatherRead> {
  const y = new Date(`${s}T00:00:00Z`).getUTCFullYear() - 1;
  const shift = (d: string) => `${y}${d.slice(4)}`;
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}`
    + `&daily=temperature_2m_max,precipitation_sum&start_date=${shift(s)}&end_date=${shift(e)}&timezone=auto`;
  const d = await (await fetch(u)).json();
  const max: number[] = d.daily.temperature_2m_max, pr: number[] = d.daily.precipitation_sum;
  const avg = max.reduce((a, b) => a + b, 0) / max.length;
  const rainDays = pr.filter((p) => p >= 1).length;
  return { source: "climate", avgTempC: Math.round(avg), rainDays,
    summary: `Typically ${Math.round(avg)}°C with ${rainDays} wet days in this period`,
    verdict: verdictOf(avg, rainDays, max.length) };
}

function verdictOf(avg: number, rainDays: number, total: number): Verdict {
  const wet = rainDays / Math.max(1, total);
  if (wet > 0.6) return "MONSOON";
  if (avg >= 38) return "EXTREME_HEAT";
  if (avg <= 5)  return "COLD";
  if (wet > 0.3) return "MIXED";
  return "GOOD";
}

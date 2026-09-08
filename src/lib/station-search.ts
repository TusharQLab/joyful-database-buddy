import type { StationWithStatus } from "@/lib/stations";

/**
 * Free-text station search.
 *
 * Understands plain names/companies/cities plus two extra hints:
 *  - fuel keywords: "CNG", "petrol", "diesel"
 *  - radius: "within 5 km", "in 2km", "1.5 km"
 */

export type ParsedQuery = {
  terms: string[];
  fuels: string[];
  radiusKm: number | null;
};

const FUEL_WORDS: Record<string, string> = {
  cng: "CNG",
  petrol: "Petrol",
  diesel: "Diesel",
};

/** Generic words that carry no matching value. */
const STOP_WORDS = new Set([
  "pump",
  "pumps",
  "station",
  "stations",
  "fuel",
  "petrolpump",
  "near",
  "nearby",
  "me",
  "within",
  "in",
  "at",
  "the",
  "of",
  "around",
  "radius",
  "km",
  "kms",
  "kilometer",
  "kilometers",
  "m",
  "meters",
]);

export function parseStationQuery(raw: string): ParsedQuery {
  const q = raw.trim().toLowerCase();
  if (!q) return { terms: [], fuels: [], radiusKm: null };

  let radiusKm: number | null = null;
  const km = q.match(/(\d+(?:\.\d+)?)\s*(km|kms|kilometers?)\b/);
  const meters = q.match(/(\d+(?:\.\d+)?)\s*(m|meters?)\b/);
  if (km) radiusKm = Number(km[1]);
  else if (meters) radiusKm = Number(meters[1]) / 1000;

  const fuels: string[] = [];
  const terms: string[] = [];

  for (const word of q.replace(/[^\p{L}\p{N}.\s]/gu, " ").split(/\s+/)) {
    if (!word) continue;
    if (/^\d+(\.\d+)?$/.test(word)) continue;
    const fuel = FUEL_WORDS[word];
    if (fuel) {
      if (!fuels.includes(fuel)) fuels.push(fuel);
      continue;
    }
    if (STOP_WORDS.has(word)) continue;
    terms.push(word);
  }

  return { terms, fuels, radiusKm: radiusKm && radiusKm > 0 ? radiusKm : null };
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type SearchOrigin = { lat: number; lng: number } | null;

export function searchStations(
  stations: StationWithStatus[],
  raw: string,
  origin: SearchOrigin,
): StationWithStatus[] {
  const { terms, fuels, radiusKm } = parseStationQuery(raw);
  if (!terms.length && !fuels.length && !radiusKm) return stations;

  const scored: Array<{ station: StationWithStatus; d: number }> = [];

  for (const station of stations) {
    const haystack = [station.name, station.company ?? "", station.city ?? "", ...(station.fuel_types ?? [])]
      .join(" ")
      .toLowerCase();

    if (!terms.every((t) => haystack.includes(t))) continue;

    if (fuels.length) {
      const offered = (station.fuel_types ?? []).map((f) => f.trim().toLowerCase());
      if (!fuels.every((f) => offered.includes(f.toLowerCase()))) continue;
    }

    let d = Number.POSITIVE_INFINITY;
    if (origin) d = distanceKm(origin.lat, origin.lng, station.latitude, station.longitude);
    if (radiusKm !== null) {
      if (!origin || d > radiusKm) continue;
    }

    scored.push({ station, d });
  }

  if (origin) scored.sort((a, b) => a.d - b.d);
  return scored.map((s) => s.station);
}

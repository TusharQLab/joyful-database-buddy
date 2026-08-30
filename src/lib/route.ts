import type { StationWithStatus } from "@/lib/stations";

export type LatLng = { lat: number; lng: number };

export type GeocodeResult = LatLng & { label: string };

export type RouteResult = {
  coordinates: [number, number][]; // [lat, lng]
  distanceKm: number;
  durationMin: number;
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

export async function geocode(query: string): Promise<GeocodeResult> {
  const q = query.trim();
  if (!q) throw new Error("Please enter a location.");

  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Couldn't reach the location service. Check your connection.");
  }
  if (!res.ok) throw new Error("Location lookup failed. Please try again.");

  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!rows.length) throw new Error(`No place found for "${q}".`);

  const hit = rows[0]!;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name };
}

export async function fetchRoute(start: LatLng, end: LatLng): Promise<RouteResult> {
  const url = `${OSRM}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Couldn't reach the routing service. Check your connection.");
  }
  if (!res.ok) throw new Error("Routing failed. Please try again.");

  const json = (await res.json()) as {
    code?: string;
    routes?: Array<{ geometry: { coordinates: [number, number][] }; distance: number; duration: number }>;
  };
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) throw new Error("No driving route found between those places.");

  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  };
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Stations within `radiusKm` of any sampled point on the route, nearest first. */
export function stationsAlongRoute(
  stations: StationWithStatus[],
  coordinates: [number, number][],
  radiusKm = 5,
): StationWithStatus[] {
  if (!coordinates.length) return [];
  const step = Math.max(1, Math.floor(coordinates.length / 400));
  const samples: [number, number][] = [];
  for (let i = 0; i < coordinates.length; i += step) samples.push(coordinates[i]!);
  samples.push(coordinates[coordinates.length - 1]!);

  const scored: Array<{ station: StationWithStatus; d: number }> = [];
  for (const station of stations) {
    let min = Infinity;
    for (const [lat, lng] of samples) {
      const d = haversineKm(station.latitude, station.longitude, lat, lng);
      if (d < min) min = d;
      if (min <= 0.2) break;
    }
    if (min <= radiusKm) scored.push({ station, d: min });
  }
  return scored.sort((a, b) => a.d - b.d).map((s) => s.station);
}

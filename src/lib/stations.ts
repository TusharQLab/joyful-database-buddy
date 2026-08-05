import { supabase } from "@/integrations/supabase/client";

export type LiveStatus = {
  cng_available: boolean;
  petrol_available: boolean;
  diesel_available: boolean;
  queue_minutes: number | null;
  power_status: boolean;
  updated_at: string;
};

export type StationWithStatus = {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  fuel_types: string[];
  live_status: LiveStatus | null;
};

export type StatusLevel = "green" | "yellow" | "red";

export const STATUS_COLORS: Record<StatusLevel, string> = {
  green: "#16a34a",
  yellow: "#eab308",
  red: "#dc2626",
};

export const LOW_QUEUE_MINUTES = 10;

export function availableFuels(station: StationWithStatus): string[] {
  const s = station.live_status;
  if (!s || !s.power_status) return [];
  const fuels: string[] = [];
  if (s.cng_available) fuels.push("CNG");
  if (s.petrol_available) fuels.push("Petrol");
  if (s.diesel_available) fuels.push("Diesel");
  return fuels;
}

export function statusLevel(station: StationWithStatus): StatusLevel {
  const s = station.live_status;
  if (!s || !s.power_status) return "red";
  if (availableFuels(station).length === 0) return "red";
  const queue = s.queue_minutes ?? 0;
  return queue <= LOW_QUEUE_MINUTES ? "green" : "yellow";
}

export async function fetchStationsWithStatus(): Promise<StationWithStatus[]> {
  const { data, error } = await supabase
    .from("stations")
    .select(
      "id, name, company, city, latitude, longitude, fuel_types, live_status(cng_available, petrol_available, diesel_available, queue_minutes, power_status, updated_at)",
    );

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const status = row.live_status as unknown as LiveStatus | LiveStatus[] | null;
    return {
      ...row,
      live_status: Array.isArray(status) ? (status[0] ?? null) : status,
    } as StationWithStatus;
  });
}

export const stationsQueryOptions = {
  queryKey: ["stations-with-status"] as const,
  queryFn: fetchStationsWithStatus,
  staleTime: 60_000,
};

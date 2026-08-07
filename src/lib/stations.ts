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

export type QueueLevel = "none" | "low" | "moderate" | "heavy" | "unknown";

export const STATUS_LABELS: Record<StatusLevel, string> = {
  green: "Available",
  yellow: "Busy",
  red: "Closed",
};

export function queueLevel(minutes: number | null | undefined): QueueLevel {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "unknown";
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return "none";
  if (m <= 15) return "low";
  if (m <= 30) return "moderate";
  return "heavy";
}

export function queueLabel(minutes: number | null | undefined): string {
  switch (queueLevel(minutes)) {
    case "none":
      return "No Queue";
    case "low":
      return "Low Queue";
    case "moderate":
      return "Moderate Queue";
    case "heavy":
      return "Heavy Queue";
    default:
      return "Unknown";
  }
}

export function formatTime(value: string | null): string {
  if (!value) return "—";
  const [h, m] = value.split(":");
  const hour = Number(h);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? "00"} ${suffix}`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "No data";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export type StationDetails = StationWithStatus & {
  open_time: string | null;
  close_time: string | null;
  /** Coarse fuel status from the most recent report, used only for "Limited" display. */
  latest_report_fuel_status: string | null;
};

/** Fuel types the station permanently offers, normalised to CNG / Petrol / Diesel labels. */
export function offeredFuels(station: StationWithStatus): string[] {
  const canonical = ["CNG", "Petrol", "Diesel"];
  return canonical.filter((f) =>
    (station.fuel_types ?? []).some((t) => t.trim().toLowerCase() === f.toLowerCase()),
  );
}

/** Fuels currently available AND permanently offered by the station. */
export function availableOfferedFuels(station: StationWithStatus): string[] {
  const available = new Set(availableFuels(station));
  return offeredFuels(station).filter((f) => available.has(f));
}

export async function fetchStationById(id: string): Promise<StationDetails | null> {
  const { data, error } = await supabase
    .from("stations")
    .select(
      "id, name, company, city, latitude, longitude, fuel_types, open_time, close_time, live_status(cng_available, petrol_available, diesel_available, queue_minutes, power_status, updated_at)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    // Malformed UUIDs should read as "not found", not a crash.
    if (error.code === "22P02" || error.message.includes("invalid input syntax")) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const { data: reportRows } = await supabase
    .from("reports")
    .select("fuel_status, created_at, updated_at")
    .eq("station_id", id)
    .order("updated_at", { ascending: false })
    .limit(1);

  const status = data.live_status as unknown as LiveStatus | LiveStatus[] | null;
  return {
    ...data,
    live_status: Array.isArray(status) ? (status[0] ?? null) : status,
    latest_report_fuel_status: reportRows?.[0]?.fuel_status ?? null,
  } as StationDetails;
}


export const stationQueryOptions = (id: string) => ({
  queryKey: ["station", id] as const,
  queryFn: () => fetchStationById(id),
  staleTime: 60_000,
});

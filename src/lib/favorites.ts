import { supabase } from "@/integrations/supabase/client";
import type { LiveStatus, StationWithStatus } from "@/lib/stations";

/** IDs of the signed-in user's saved stations. RLS scopes rows to the owner. */
export async function fetchFavoriteIds(): Promise<string[]> {
  const { data, error } = await supabase.from("favorites").select("station_id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.station_id);
}

export const favoriteIdsQueryOptions = {
  queryKey: ["favorite-ids"] as const,
  queryFn: fetchFavoriteIds,
  staleTime: 30_000,
};

export type FavoriteStation = StationWithStatus & { favorited_at: string };

export async function fetchFavoriteStations(): Promise<FavoriteStation[]> {
  const { data, error } = await supabase
    .from("favorites")
    .select(
      "created_at, stations(id, name, company, city, latitude, longitude, fuel_types, live_status(cng_available, petrol_available, diesel_available, queue_minutes, power_status, updated_at))",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => {
      const station = row.stations as unknown as
        | (Omit<StationWithStatus, "live_status"> & {
            live_status: LiveStatus | LiveStatus[] | null;
          })
        | null;
      if (!station) return null;
      const status = station.live_status;
      return {
        ...station,
        live_status: Array.isArray(status) ? (status[0] ?? null) : status,
        favorited_at: row.created_at,
      } as FavoriteStation;
    })
    .filter((row): row is FavoriteStation => row !== null);
}

export const favoriteStationsQueryOptions = {
  queryKey: ["favorite-stations"] as const,
  queryFn: fetchFavoriteStations,
  staleTime: 30_000,
};

/** Saves a station; a duplicate save is treated as success (idempotent). */
export async function addFavorite(stationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("favorites")
    .insert({ station_id: stationId, user_id: userId });
  // 23505 = unique violation → already saved, nothing to do.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function removeFavorite(stationId: string): Promise<void> {
  const { error } = await supabase.from("favorites").delete().eq("station_id", stationId);
  if (error) throw new Error(error.message);
}

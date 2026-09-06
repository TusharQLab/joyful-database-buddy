import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LiveStatus, StationDetails } from "@/lib/stations";

export type ManagerAccess = {
  isManager: boolean;
  /** Approved assignment only — null when unassigned or awaiting approval. */
  station: { id: string; name: string; city: string | null; company: string | null } | null;
  /** True when a row exists but has not been approved yet. */
  pendingApproval: boolean;
};

/**
 * Server-side role + station-assignment lookup.
 * Runs as the signed-in user, so RLS decides what is visible: a user can only
 * ever read their own role rows and their own (single) station assignment.
 */
export const getManagerAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagerAccess> => {
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "manager");
    if (rolesError) throw rolesError;

    const isManager = (roles?.length ?? 0) > 0;
    if (!isManager) return { isManager: false, station: null, pendingApproval: false };

    const { data: assignment, error: assignmentError } = await context.supabase
      .from("station_managers")
      .select("station_id, approved, stations(id, name, city, company)")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;

    if (!assignment) return { isManager: true, station: null, pendingApproval: false };
    if (!assignment.approved) return { isManager: true, station: null, pendingApproval: true };

    const station = assignment.stations as unknown as {
      id: string;
      name: string;
      city: string | null;
      company: string | null;
    } | null;

    return {
      isManager: true,
      station: station ? { id: station.id, name: station.name, city: station.city, company: station.company } : null,
      pendingApproval: false,
    };
  });

/**
 * Full station details + live status for the signed-in manager's approved
 * station assignment. RLS guarantees the manager can only read their own
 * assignment; the station/live_status tables are publicly readable, and the
 * newest report's coarse fuel status is authenticated-readable. Returns null
 * when the caller is not an approved manager with an assigned station.
 */
export const getManagerStation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StationDetails | null> => {
    const { data: assignment, error: assignmentError } = await context.supabase
      .from("station_managers")
      .select("station_id, approved")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment || !assignment.approved || !assignment.station_id) return null;

    const stationId = assignment.station_id;

    const { data, error } = await context.supabase
      .from("stations")
      .select(
        "id, name, company, city, latitude, longitude, fuel_types, open_time, close_time, live_status(cng_available, petrol_available, diesel_available, queue_minutes, power_status, updated_at)",
      )
      .eq("id", stationId)
      .maybeSingle();
    if (error) {
      if (error.code === "22P02" || error.message.includes("invalid input syntax")) return null;
      throw error;
    }
    if (!data) return null;

    const { data: reportRows } = await context.supabase
      .from("reports")
      .select("fuel_status, updated_at")
      .eq("station_id", stationId)
      .order("updated_at", { ascending: false })
      .limit(1);

    const status = data.live_status as unknown as LiveStatus | LiveStatus[] | null;
    return {
      ...data,
      live_status: Array.isArray(status) ? (status[0] ?? null) : status,
      latest_report_fuel_status: reportRows?.[0]?.fuel_status ?? null,
    } as StationDetails;
  });

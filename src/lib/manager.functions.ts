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

/** Official report submitted by a station manager (source = 'manager'). */
export type ManagerReportInput = {
  fuel_status: "available" | "limited" | "unavailable";
  power_status: boolean;
  comment?: string | undefined;
};

export type ManagerReportRow = {
  id: string;
  station_id: string;
  fuel_status: string;
  power_status: boolean;
  comment: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

/** The manager's own latest official report for their assigned station. */
export const getMyManagerReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagerReportRow | null> => {
    const { data, error } = await context.supabase
      .from("reports")
      .select("id, station_id, fuel_status, power_status, comment, source, created_at, updated_at")
      .eq("user_id", context.userId)
      .eq("source", "manager")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as ManagerReportRow | null) ?? null;
  });

/**
 * Creates or updates the manager's official report. The station is resolved
 * server-side from the approved assignment and never taken from the client;
 * RLS additionally rejects any manager report for another station, and
 * managers can never touch driver rows (source = 'driver').
 */
export const submitManagerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ManagerReportInput) => {
    if (!["available", "limited", "unavailable"].includes(input.fuel_status)) {
      throw new Error("Select the current fuel availability.");
    }
    if (typeof input.power_status !== "boolean") throw new Error("Select the current power status.");
    const comment = (input.comment ?? "").trim();
    if (comment.length > 150) throw new Error("Note must be 150 characters or less.");
    return { fuel_status: input.fuel_status, power_status: input.power_status, comment };
  })
  .handler(async ({ context, data }): Promise<{ mode: "created" | "updated" }> => {
    const { data: assignment, error: assignmentError } = await context.supabase
      .from("station_managers")
      .select("station_id, approved")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment?.approved || !assignment.station_id) {
      throw new Error("You don't have an approved station assignment.");
    }
    const stationId = assignment.station_id;

    const payload = {
      fuel_status: data.fuel_status,
      power_status: data.power_status,
      comment: data.comment.length > 0 ? data.comment : null,
      queue_status: "none",
      queue_minutes: null as number | null,
      status: !data.power_status || data.fuel_status === "unavailable" ? "closed" : "available",
      source: "manager",
    };

    const { data: existing } = await context.supabase
      .from("reports")
      .select("id")
      .eq("user_id", context.userId)
      .eq("station_id", stationId)
      .eq("source", "manager")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await context.supabase.from("reports").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { mode: "updated" };
    }

    const { error } = await context.supabase
      .from("reports")
      .insert({ ...payload, station_id: stationId, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { mode: "created" };
  });

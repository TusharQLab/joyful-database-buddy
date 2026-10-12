// Browser-side manager data access. Uses the signed-in user's session directly,
// so it works on any host (no server function needed). RLS enforces that a
// manager only sees/edits their own approved station and their own reports.
import { supabase } from "@/integrations/supabase/client";
import type { LiveStatus, StationDetails } from "@/lib/stations";
import type { ManagerAccess, ManagerReportInput, ManagerReportRow } from "@/lib/manager.functions";

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again.");
  return data.user.id;
}

async function approvedStationId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("station_managers")
    .select("station_id, approved")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.approved && data.station_id ? data.station_id : null;
}

export async function getManagerAccess(): Promise<ManagerAccess> {
  const userId = await currentUserId();
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager");
  if (rolesError) throw rolesError;
  if (!roles?.length) return { isManager: false, station: null, pendingApproval: false };

  const { data: assignment, error } = await supabase
    .from("station_managers")
    .select("station_id, approved, stations(id, name, city, company)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!assignment) return { isManager: true, station: null, pendingApproval: false };
  if (!assignment.approved) return { isManager: true, station: null, pendingApproval: true };
  const s = assignment.stations as unknown as ManagerAccess["station"];
  return { isManager: true, station: s ? { id: s.id, name: s.name, city: s.city, company: s.company } : null, pendingApproval: false };
}

export async function getManagerStation(): Promise<StationDetails | null> {
  const stationId = await approvedStationId(await currentUserId());
  if (!stationId) return null;
  const { data, error } = await supabase
    .from("stations")
    .select(
      "id, name, company, city, latitude, longitude, fuel_types, open_time, close_time, live_status(cng_available, petrol_available, diesel_available, queue_minutes, power_status, updated_at)",
    )
    .eq("id", stationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: reportRows } = await supabase
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
}

export async function getMyManagerReport(): Promise<ManagerReportRow | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("reports")
    .select("id, station_id, fuel_status, power_status, comment, source, created_at, updated_at")
    .eq("user_id", userId)
    .eq("source", "manager")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ManagerReportRow | null) ?? null;
}

export async function submitManagerReport({ data: input }: { data: ManagerReportInput }): Promise<{ mode: "created" | "updated" }> {
  if (!["available", "limited", "unavailable"].includes(input.fuel_status)) throw new Error("Select the current fuel availability.");
  if (typeof input.power_status !== "boolean") throw new Error("Select the current power status.");
  const comment = (input.comment ?? "").trim();
  if (comment.length > 150) throw new Error("Note must be 150 characters or less.");

  const userId = await currentUserId();
  const stationId = await approvedStationId(userId);
  if (!stationId) throw new Error("You don't have an approved station assignment.");

  const payload = {
    fuel_status: input.fuel_status,
    power_status: input.power_status,
    comment: comment.length > 0 ? comment : null,
    queue_status: "none",
    queue_minutes: null as number | null,
    status: !input.power_status || input.fuel_status === "unavailable" ? "closed" : "available",
    source: "manager",
  };

  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .eq("user_id", userId)
    .eq("station_id", stationId)
    .eq("source", "manager")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("reports").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { mode: "updated" };
  }
  const { error } = await supabase.from("reports").insert({ ...payload, station_id: stationId, user_id: userId });
  if (error) throw new Error(error.message);
  return { mode: "created" };
}

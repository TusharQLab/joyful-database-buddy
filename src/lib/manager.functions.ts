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

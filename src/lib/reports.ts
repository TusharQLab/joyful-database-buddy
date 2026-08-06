import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reporting domain module.
 *
 * Deliberately split into:
 *  - constants/types  (shared vocabulary)
 *  - validation       (zod schema, reused by UI + db layer)
 *  - db operations    (supabase reads/writes, RLS-scoped)
 *  - business logic   (10-minute edit window resolution)
 *
 * Future features (trust score, owner reports, confirmations, confidence,
 * expiry, fraud checks) can hook in here without touching UI components.
 */

export const FUEL_STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "limited", label: "Limited" },
  { value: "unavailable", label: "Unavailable" },
] as const;

export const QUEUE_STATUS_OPTIONS = [
  { value: "none", label: "No Queue" },
  { value: "low", label: "Low Queue" },
  { value: "moderate", label: "Moderate Queue" },
  { value: "heavy", label: "Heavy Queue" },
] as const;

export type FuelStatus = (typeof FUEL_STATUS_OPTIONS)[number]["value"];
export type QueueStatus = (typeof QUEUE_STATUS_OPTIONS)[number]["value"];

/** Window (ms) during which a user's own report is edited instead of duplicated. */
export const REPORT_EDIT_WINDOW_MS = 10 * 60 * 1000;

export const MAX_QUEUE_MINUTES = 120;
export const MAX_COMMENT_LENGTH = 150;

export const reportSchema = z.object({
  fuel_status: z.enum(["available", "limited", "unavailable"], {
    message: "Select the current fuel availability.",
  }),
  queue_status: z.enum(["none", "low", "moderate", "heavy"], {
    message: "Select the current queue level.",
  }),
  queue_minutes: z
    .number({ message: "Enter the estimated queue time in minutes." })
    .int({ message: "Queue time must be a whole number of minutes." })
    .min(0, { message: "Queue time cannot be negative." })
    .max(MAX_QUEUE_MINUTES, { message: `Queue time cannot exceed ${MAX_QUEUE_MINUTES} minutes.` }),
  power_status: z.boolean({ message: "Select the current power status." }),
  comment: z
    .string()
    .trim()
    .max(MAX_COMMENT_LENGTH, { message: `Comment must be ${MAX_COMMENT_LENGTH} characters or less.` })
    .optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;

export type ReportRow = {
  id: string;
  user_id: string;
  station_id: string;
  status: string;
  fuel_status: string;
  queue_status: string;
  queue_minutes: number | null;
  power_status: boolean;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

/** Legacy coarse status column kept in sync for backwards compatibility. */
function coarseStatus(input: ReportInput): string {
  if (!input.power_status || input.fuel_status === "unavailable") return "closed";
  if (input.queue_status === "moderate" || input.queue_status === "heavy") return "queue";
  return "available";
}

export function isWithinEditWindow(report: Pick<ReportRow, "created_at">): boolean {
  return Date.now() - new Date(report.created_at).getTime() < REPORT_EDIT_WINDOW_MS;
}

/** Most recent report by the current user for a station (RLS-safe: reports are public-read). */
export async function fetchMyLatestReport(
  stationId: string,
  userId: string,
): Promise<ReportRow | null> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("station_id", stationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ReportRow | null) ?? null;
}

export const myLatestReportQueryOptions = (stationId: string, userId: string | undefined) => ({
  queryKey: ["my-latest-report", stationId, userId ?? "anon"] as const,
  queryFn: () => (userId ? fetchMyLatestReport(stationId, userId) : Promise.resolve(null)),
  enabled: Boolean(userId),
  staleTime: 30_000,
});

export type SubmitResult = { mode: "created" | "updated" };

/**
 * Submits a report. `live_status` is never written from the client — the
 * database trigger recalculates it from the newest report.
 */
export async function submitReport(
  stationId: string,
  rawInput: ReportInput,
): Promise<SubmitResult> {
  const input = reportSchema.parse(rawInput);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Your session has expired. Please sign in again to report.");
  }
  const userId = userData.user.id;

  const payload = {
    fuel_status: input.fuel_status,
    queue_status: input.queue_status,
    queue_minutes: input.queue_minutes,
    power_status: input.power_status,
    comment: input.comment && input.comment.length > 0 ? input.comment : null,
    status: coarseStatus(input),
  };

  const existing = await fetchMyLatestReport(stationId, userId);

  if (existing && isWithinEditWindow(existing)) {
    const { error } = await supabase
      .from("reports")
      .update(payload)
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw new Error(translateDbError(error.message));
    return { mode: "updated" };
  }

  const { error } = await supabase
    .from("reports")
    .insert({ ...payload, station_id: stationId, user_id: userId });
  if (error) throw new Error(translateDbError(error.message));
  return { mode: "created" };
}

function translateDbError(message: string): string {
  if (message.includes("row-level security")) {
    return "You can only submit or edit your own reports.";
  }
  if (message.includes("reports_station_id_fkey") || message.includes("invalid input syntax")) {
    return "This station could not be found.";
  }
  if (message.includes("reports_queue_minutes_check")) {
    return `Queue time must be between 0 and ${MAX_QUEUE_MINUTES} minutes.`;
  }
  if (message.includes("reports_comment_check")) {
    return `Comment must be ${MAX_COMMENT_LENGTH} characters or less.`;
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Network problem — check your connection and try again.";
  }
  return message || "Something went wrong while saving your report.";
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  FUEL_STATUS_OPTIONS,
  MAX_COMMENT_LENGTH,
  MAX_QUEUE_MINUTES,
  QUEUE_STATUS_OPTIONS,
  isWithinEditWindow,
  myLatestReportQueryOptions,
  reportSchema,
  submitReport,
  type FuelStatus,
  type QueueStatus,
} from "@/lib/reports";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              name={name}
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const DEFAULTS = {
  queue_status: "none" as QueueStatus,
  queue_minutes: "0",
  power_status: true,
  comment: "",
};

const FUELS = ["CNG", "Petrol", "Diesel"] as const;
type Fuel = (typeof FUELS)[number];
type FuelKey = Fuel | "All";

/** Collapses per-fuel availability into the single fuel_status the database stores. */
function combineFuelStatus(values: FuelStatus[]): FuelStatus {
  if (values.length === 0) return "unavailable";
  if (values.every((v) => v === "available")) return "available";
  if (values.every((v) => v === "unavailable")) return "unavailable";
  return "limited";
}

export function ReportStatusForm({ stationId }: { stationId: string }) {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedFuels, setSelectedFuels] = useState<FuelKey[]>([]);
  const [fuelStatuses, setFuelStatuses] = useState<Partial<Record<FuelKey, FuelStatus>>>({});
  const [queueStatus, setQueueStatus] = useState<QueueStatus>(DEFAULTS.queue_status);
  const [queueMinutes, setQueueMinutes] = useState(DEFAULTS.queue_minutes);
  const [powerStatus, setPowerStatus] = useState(DEFAULTS.power_status);
  const [comment, setComment] = useState(DEFAULTS.comment);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: latest } = useQuery(myLatestReportQueryOptions(stationId, user?.id));
  const editing = Boolean(latest && isWithinEditWindow(latest));

  useEffect(() => {
    if (!latest || !isWithinEditWindow(latest)) return;
    setSelectedFuels(["All"]);
    setFuelStatuses({ All: latest.fuel_status as FuelStatus });
    setQueueStatus(latest.queue_status as QueueStatus);
    setQueueMinutes(String(latest.queue_minutes ?? 0));
    setPowerStatus(latest.power_status);
    setComment(latest.comment ?? "");
  }, [latest]);

  const toggleFuel = (fuel: FuelKey) => {
    setSelectedFuels((prev) => {
      if (fuel === "All") return prev.includes("All") ? [] : ["All"];
      const base = prev.filter((f) => f !== "All");
      const next = base.includes(fuel) ? base.filter((f) => f !== fuel) : [...base, fuel];
      if (FUELS.every((f) => next.includes(f))) return ["All"];
      return FUELS.filter((f) => next.includes(f));
    });
  };

  const statusesForSelection = selectedFuels.map((f) => fuelStatuses[f]).filter(Boolean) as FuelStatus[];
  const allChosen = selectedFuels.length > 0 && statusesForSelection.length === selectedFuels.length;

  const parsed = useMemo(
    () => ({
      fuel_status: combineFuelStatus(statusesForSelection),
      queue_status: queueStatus,
      queue_minutes: queueMinutes.trim() === "" ? Number.NaN : Number(queueMinutes),
      power_status: powerStatus,
      comment,
    }),
    [statusesForSelection, queueStatus, queueMinutes, powerStatus, comment],
  );


  const mutation = useMutation({
    mutationFn: () => submitReport(stationId, reportSchema.parse(parsed)),
    onSuccess: (result) => {
      toast.success(
        result.mode === "updated"
          ? "Your previous report has been updated."
          : "Thank you! Your report has been submitted.",
      );
      void queryClient.invalidateQueries({ queryKey: ["station", stationId] });
      void queryClient.invalidateQueries({ queryKey: ["stations-with-status"] });
      void queryClient.invalidateQueries({ queryKey: ["my-latest-report", stationId] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Couldn't submit your report.");
    },
  });

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Sign in to report the current status of this station.
      </div>
    );
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;

    const result = reportSchema.safeParse(parsed);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate();
  };

  return (
    <section className="mx-auto mt-4 w-full max-w-2xl">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <div>
          <h2 className="text-base font-semibold text-card-foreground">Report current status</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {editing
              ? "You reported this station in the last 10 minutes — submitting will update that report."
              : "Help other drivers with what you're seeing right now."}
          </p>
        </div>

        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available fuel types
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["All", ...FUELS] as FuelKey[]).map((fuel) => {
                const selected = selectedFuels.includes(fuel);
                return (
                  <button
                    key={fuel}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleFuel(fuel)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {fuel}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {selectedFuels.map((fuel) => (
            <Segmented
              key={fuel}
              name={`fuel_status_${fuel}`}
              label={fuel === "All" ? "Availability (all fuels)" : `${fuel} availability`}
              value={fuelStatuses[fuel] ?? ("" as FuelStatus)}
              options={FUEL_STATUS_OPTIONS}
              onChange={(value) => setFuelStatuses((prev) => ({ ...prev, [fuel]: value }))}
            />
          ))}
          {errors['fuel_status'] && <p className="text-xs text-destructive">{errors['fuel_status']}</p>}


          <Segmented
            name="queue_status"
            label="Queue status"
            value={queueStatus}
            options={QUEUE_STATUS_OPTIONS}
            onChange={setQueueStatus}
          />
          {errors['queue_status'] && <p className="text-xs text-destructive">{errors['queue_status']}</p>}

          <div>
            <Label htmlFor="queue-minutes" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estimated queue time (minutes)
            </Label>
            <Input
              id="queue-minutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_QUEUE_MINUTES}
              value={queueMinutes}
              onChange={(event) => setQueueMinutes(event.target.value)}
              className="mt-2"
            />
            {errors['queue_minutes'] && (
              <p className="mt-1 text-xs text-destructive">{errors['queue_minutes']}</p>
            )}
          </div>

          <Segmented
            name="power_status"
            label="Power status"
            value={powerStatus ? "on" : "off"}
            options={[
              { value: "on", label: "Power Available" },
              { value: "off", label: "Power Outage" },
            ] as const}
            onChange={(value) => setPowerStatus(value === "on")}
          />

          <div>
            <Label htmlFor="report-comment" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Comment (optional)
            </Label>
            <Textarea
              id="report-comment"
              value={comment}
              maxLength={MAX_COMMENT_LENGTH}
              rows={2}
              placeholder="Anything else drivers should know?"
              onChange={(event) => setComment(event.target.value)}
              className="mt-2"
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-destructive">{errors['comment'] ?? ""}</p>
              <p className="text-xs text-muted-foreground">
                {comment.length}/{MAX_COMMENT_LENGTH}
              </p>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {mutation.isPending ? "Submitting…" : editing ? "Update my report" : "Submit report"}
        </Button>
      </form>
    </section>
  );
}

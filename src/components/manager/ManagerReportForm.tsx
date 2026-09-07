import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyManagerReport, submitManagerReport } from "@/lib/manager.functions";

const FUELS = ["CNG", "Petrol", "Diesel"] as const;
type Fuel = (typeof FUELS)[number];
type FuelKey = Fuel | "All";
type FuelStatus = "available" | "limited" | "unavailable";

const FUEL_STATUS_OPTIONS = [
  { value: "available" as const, label: "Available" },
  { value: "limited" as const, label: "Limited" },
  { value: "unavailable" as const, label: "Unavailable" },
];

function combine(values: FuelStatus[]): FuelStatus {
  if (values.length === 0) return "unavailable";
  if (values.every((v) => v === "available")) return "available";
  if (values.every((v) => v === "unavailable")) return "unavailable";
  return "limited";
}

function Chip({
  selected,
  children,
  onClick,
  role,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
  role: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

/** Official station update, restricted by the database to the manager's own station. */
export function ManagerReportForm() {
  const queryClient = useQueryClient();
  const fetchMine = useServerFn(getMyManagerReport);
  const submit = useServerFn(submitManagerReport);

  const [selectedFuels, setSelectedFuels] = useState<FuelKey[]>([]);
  const [fuelStatuses, setFuelStatuses] = useState<Partial<Record<FuelKey, FuelStatus>>>({});
  const [powerStatus, setPowerStatus] = useState(true);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: mine } = useQuery({
    queryKey: ["my-manager-report"],
    queryFn: () => fetchMine(),
    retry: false,
  });

  useEffect(() => {
    if (!mine) return;
    setSelectedFuels(["All"]);
    setFuelStatuses({ All: mine.fuel_status as FuelStatus });
    setPowerStatus(mine.power_status);
    setComment(mine.comment ?? "");
  }, [mine]);

  const toggleFuel = (fuel: FuelKey) => {
    setSelectedFuels((prev) => {
      if (fuel === "All") return prev.includes("All") ? [] : ["All"];
      const base = prev.filter((f) => f !== "All");
      const next = base.includes(fuel) ? base.filter((f) => f !== fuel) : [...base, fuel];
      if (FUELS.every((f) => next.includes(f))) return ["All"];
      return FUELS.filter((f) => next.includes(f));
    });
  };

  const chosen = selectedFuels.map((f) => fuelStatuses[f]).filter(Boolean) as FuelStatus[];

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: { fuel_status: combine(chosen), power_status: powerStatus, comment },
      }),
    onSuccess: (result) => {
      toast.success(
        result.mode === "updated" ? "Your official update has been changed." : "Official update published.",
      );
      void queryClient.invalidateQueries({ queryKey: ["my-manager-report"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Couldn't save your update.");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    if (selectedFuels.length === 0) return setError("Select at least one fuel type.");
    if (chosen.length !== selectedFuels.length) {
      return setError("Choose availability for each selected fuel type.");
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div>
        <h2 className="text-base font-semibold text-card-foreground">Official station update</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Published as an official update for your station. Queue and waiting times stay driver-reported.
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fuel types
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["All", ...FUELS] as FuelKey[]).map((fuel) => (
            <Chip
              key={fuel}
              role="checkbox"
              selected={selectedFuels.includes(fuel)}
              onClick={() => toggleFuel(fuel)}
            >
              {fuel}
            </Chip>
          ))}
        </div>
      </fieldset>

      {selectedFuels.map((fuel) => (
        <fieldset key={fuel}>
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {fuel === "All" ? "Availability (all fuels)" : `${fuel} availability`}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {FUEL_STATUS_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                role="radio"
                selected={fuelStatuses[fuel] === option.value}
                onClick={() => setFuelStatuses((prev) => ({ ...prev, [fuel]: option.value }))}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Power status
        </legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
          <Chip role="radio" selected={powerStatus} onClick={() => setPowerStatus(true)}>
            Power Available
          </Chip>
          <Chip role="radio" selected={!powerStatus} onClick={() => setPowerStatus(false)}>
            Power Outage
          </Chip>
        </div>
      </fieldset>

      <div>
        <Label
          htmlFor="manager-comment"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Note (optional)
        </Label>
        <Textarea
          id="manager-comment"
          value={comment}
          maxLength={150}
          rows={2}
          placeholder="Anything drivers should know?"
          onChange={(event) => setComment(event.target.value)}
          className="mt-2"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/150</p>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {mutation.isPending ? "Saving…" : mine ? "Update official status" : "Publish official status"}
      </Button>
    </form>
  );
}

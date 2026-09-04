import { useState } from "react";
import { Loader2, Route as RouteIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchRoute, geocode, type RouteResult } from "@/lib/route";

export type RouteSearchState = {
  route: RouteResult;
  startLabel: string;
  endLabel: string;
};

export function RouteSearchPanel({
  active,
  matchedCount,
  onResult,
  onClear,
  compact = false,
}: {
  active: RouteSearchState | null;
  matchedCount: number;
  onResult: (state: RouteSearchState) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const from = await geocode(start);
      const to = await geocode(end);
      const route = await fetchRoute(from, to);
      onResult({ route, startLabel: from.label, endLabel: to.label });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    onClear();
    setError(null);
  }

  if (!open && !active) {
    return (
      <div className="pointer-events-auto flex justify-start">
        <Button size="sm" onClick={() => setOpen(true)}>
          <RouteIcon className="size-4" aria-hidden="true" />
          Route Search
        </Button>
      </div>
    );
  }

  if (compact && active) {
    return (
      <div className="pointer-events-auto shrink-0 rounded-2xl border border-border bg-card/95 p-3 shadow-md backdrop-blur">
        <div className="flex items-start gap-2">
          <RouteIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-card-foreground">
              {active.startLabel.split(",")[0]} → {active.endLabel.split(",")[0]}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {active.route.distanceKm.toFixed(1)} km · ~{Math.round(active.route.durationMin)} min ·{" "}
              {matchedCount} station{matchedCount === 1 ? "" : "s"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={handleClear}
            aria-label="Clear route"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return (

    <div className="pointer-events-auto shrink-0 rounded-xl border border-border bg-card/95 p-3 shadow-md backdrop-blur">

      <div className="mb-2 flex items-center gap-2">
        <RouteIcon className="size-4 text-primary" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold text-card-foreground">Route Search</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => {
            setOpen(false);
            if (active) handleClear();
          }}
          aria-label="Close route search"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {active ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-card-foreground">From:</span> {active.startLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-card-foreground">To:</span> {active.endLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {active.route.distanceKm.toFixed(1)} km · ~{Math.round(active.route.durationMin)} min ·{" "}
            {matchedCount === 0
              ? "No stations near this route"
              : `${matchedCount} station${matchedCount === 1 ? "" : "s"} along route`}
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={handleClear}>
            Clear route
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="route-start" className="text-xs">
              Start location
            </Label>
            <Input
              id="route-start"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              placeholder="e.g. Connaught Place, Delhi"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="route-end" className="text-xs">
              Destination
            </Label>
            <Input
              id="route-end"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              placeholder="e.g. Noida Sector 62"
              autoComplete="off"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button type="submit" size="sm" className="w-full" disabled={busy || !start.trim() || !end.trim()}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Finding route…
              </>
            ) : (
              "Find route"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

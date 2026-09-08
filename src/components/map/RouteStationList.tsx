import { ChevronDown, ChevronUp } from "lucide-react";
import {
  availableOfferedFuels,
  formatUpdatedLabel,
  queueLabel,
  statusLevel,
  STATUS_COLORS,
  type StationWithStatus,
} from "@/lib/stations";
import { useServerNow } from "@/lib/server-time";
import { cn } from "@/lib/utils";

export function RouteStationList({
  stations,
  onSelect,
  variant = "panel",
  expanded = true,
  onToggle,
  title = "Stations along route",
}: {
  stations: StationWithStatus[];
  onSelect: (stationId: string) => void;
  variant?: "panel" | "sheet";
  expanded?: boolean;
  onToggle?: () => void;
  title?: string;
}) {
  const now = useServerNow();
  const isSheet = variant === "sheet";

  return (
    <div
      className={cn(
        "pointer-events-auto flex min-h-0 flex-col overflow-hidden border border-border bg-card/95 shadow-md backdrop-blur",
        isSheet
          ? "rounded-t-2xl border-b-0 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.35)]"
          : "flex-1 rounded-xl",
      )}
    >
      {isSheet ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full flex-col items-center gap-1.5 px-3 pb-2 pt-2 focus:outline-none"
        >
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <span className="flex w-full items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title} ({stations.length})
            </span>
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
        </button>
      ) : (
        <div className="border-b border-border px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title} ({stations.length})
          </h3>
        </div>
      )}

      {isSheet && !expanded ? null : stations.length === 0 ? (
        <p className="border-t border-border px-3 py-4 text-xs text-muted-foreground">
          No stations within 1.5 km of this route.
        </p>
      ) : (
        <ul
          className={cn(
            "min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain border-t border-border",
            isSheet && "max-h-[40vh]",
          )}
        >
          {stations.map((station) => {
            const status = station.live_status;
            const fuels = availableOfferedFuels(station);
            return (
              <li key={station.id}>
                <button
                  type="button"
                  onClick={() => onSelect(station.id)}
                  className="w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[statusLevel(station)] }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-card-foreground">{station.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[station.company, station.city].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="mt-1 truncate text-xs text-card-foreground">
                        <span className="text-muted-foreground">Available now: </span>
                        {fuels.length ? fuels.join(", ") : "None right now"}
                      </p>
                      <p className="truncate text-xs text-card-foreground">
                        <span className="text-muted-foreground">Queue: </span>
                        {!status || !status.power_status
                          ? "Unavailable"
                          : `${queueLabel(status.queue_minutes)}${
                              status.queue_minutes !== null
                                ? ` · ~${Math.max(0, Math.round(status.queue_minutes))} min`
                                : ""
                            }`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {status ? formatUpdatedLabel(status.updated_at, now) : "No live status yet"}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

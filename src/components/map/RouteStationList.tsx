import {
  availableOfferedFuels,
  formatUpdatedLabel,
  queueLabel,
  statusLevel,
  STATUS_COLORS,
  type StationWithStatus,
} from "@/lib/stations";
import { useServerNow } from "@/lib/server-time";

export function RouteStationList({
  stations,
  onSelect,
}: {
  stations: StationWithStatus[];
  onSelect: (stationId: string) => void;
}) {
  const now = useServerNow();

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-4 z-[550] flex max-h-[45%] flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-md backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-3 sm:top-40 sm:max-h-none sm:w-72">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stations along route ({stations.length})
        </h3>
      </div>

      {stations.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No stations within 1.5 km of this route.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
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
                      <p className="mt-1 text-xs text-card-foreground">
                        <span className="text-muted-foreground">Available now: </span>
                        {fuels.length ? fuels.join(", ") : "None right now"}
                      </p>
                      <p className="text-xs text-card-foreground">
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

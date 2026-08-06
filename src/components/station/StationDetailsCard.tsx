import {
  availableFuels,
  formatRelativeTime,
  formatTime,
  queueLabel,
  statusLevel,
  STATUS_COLORS,
  STATUS_LABELS,
  type StationDetails,
} from "@/lib/stations";
import { Clock, Building2, MapPin, Zap, ZapOff, Users, Fuel } from "lucide-react";

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm text-card-foreground">{value}</dd>
      </div>
    </div>
  );
}

export function StationDetailsCard({ station }: { station: StationDetails }) {
  const status = station.live_status;
  const level = statusLevel(station);
  const fuels = availableFuels(station);
  const supported = station.fuel_types?.length ? station.fuel_types.join(", ") : "—";

  return (
    <article className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-card-foreground sm:text-2xl">
              {station.name || "Unnamed station"}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {[station.company, station.city].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-card-foreground"
            style={{ backgroundColor: `${STATUS_COLORS[level]}1a` }}
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[level] }}
              aria-hidden="true"
            />
            {STATUS_LABELS[level]}
          </span>
        </div>

        <dl className="mt-4 divide-y divide-border border-t border-border sm:grid sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
          <Row icon={<Building2 className="size-4" />} label="Fuel company" value={station.company || "—"} />
          <Row icon={<MapPin className="size-4" />} label="City" value={station.city || "—"} />
          <Row
            icon={<Fuel className="size-4" />}
            label="Available now"
            value={fuels.length ? fuels.join(", ") : "None right now"}
          />
          <Row icon={<Fuel className="size-4" />} label="Fuel types offered" value={supported} />
          <Row icon={<Clock className="size-4" />} label="Opening time" value={formatTime(station.open_time)} />
          <Row icon={<Clock className="size-4" />} label="Closing time" value={formatTime(station.close_time)} />
          <Row
            icon={<Users className="size-4" />}
            label="Queue"
            value={
              !status || !status.power_status
                ? "Unavailable"
                : `${queueLabel(status.queue_minutes)}${
                    status.queue_minutes !== null
                      ? ` · ~${Math.max(0, Math.round(status.queue_minutes))} min`
                      : ""
                  }`
            }
          />
          <Row
            icon={status?.power_status ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
            label="Power status"
            value={!status ? "Unknown" : status.power_status ? "Power on" : "Power outage"}
          />
        </dl>

        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          {status ? `Last updated ${formatRelativeTime(status.updated_at)}` : "No live status reported yet"}
        </p>
      </div>
    </article>
  );
}

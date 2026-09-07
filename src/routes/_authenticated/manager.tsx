import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Building2,
  Clock,
  Fuel,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Users,
  Zap,
  ZapOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getManagerAccess, getManagerStation, type ManagerAccess } from "@/lib/manager.functions";
import {
  formatTime,
  formatUpdatedLabel,
  liveFuelAvailability,
  offeredFuels,
  queueLabel,
  statusLevel,
  STATUS_COLORS,
  STATUS_LABELS,
  type StationDetails,
} from "@/lib/stations";
import { useServerNow } from "@/lib/server-time";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({
    meta: [
      { title: "Manager Area — Fuelio Station Owners" },
      {
        name: "description",
        content: "Secure area for approved Fuelio station managers to view their assigned station.",
      },
      { property: "og:title", content: "Manager Area — Fuelio Station Owners" },
      {
        property: "og:description",
        content: "Approved station managers can access their assigned Fuelio station here.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async (): Promise<ManagerAccess> => getManagerAccess(),
  component: ManagerArea,
  errorComponent: () => (
    <ManagerShell>
      <Blocked
        title="Manager area unavailable"
        message="We couldn't check your manager access right now. Please try again in a moment."
      />
    </ManagerShell>
  ),
  notFoundComponent: () => (
    <ManagerShell>
      <Blocked title="Not found" message="This manager page doesn't exist." />
    </ManagerShell>
  ),
});

function ManagerShell({
  children,
  stationName,
}: {
  children: React.ReactNode;
  stationName?: string | null;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Fuel className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
            {stationName || "Fuelio Manager"}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {stationName ? "Manager · " : ""}
            {user?.email}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} disabled={busy}>
          <LogOut className="size-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{busy ? "Logging out…" : "Log out"}</span>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 p-4">{children}</main>
    </div>
  );
}

function Blocked({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <ShieldAlert className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/app">Back to the map</Link>
      </Button>
    </section>
  );
}

function ManagerArea() {
  const access = Route.useLoaderData();

  if (!access.isManager) {
    return (
      <ManagerShell>
        <Blocked
          title="Manager access required"
          message="This account isn't registered as a station manager. If you own or run a station, ask the Fuelio team to register you."
        />
      </ManagerShell>
    );
  }

  if (access.pendingApproval) {
    return (
      <ManagerShell>
        <Blocked
          title="Approval pending"
          message="Your station assignment hasn't been approved yet. You'll get access to the manager area as soon as it's approved."
        />
      </ManagerShell>
    );
  }

  if (!access.station) {
    return (
      <ManagerShell>
        <Blocked
          title="No station assigned"
          message="You don't have a station assigned to your account yet. Once a station is assigned and approved, it will appear here."
        />
      </ManagerShell>
    );
  }

  return <ManagerStationView stationName={access.station.name} />;
}

function ManagerStationView({ stationName }: { stationName: string }) {
  const fetchStation = useServerFn(getManagerStation);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["manager-station"],
    queryFn: () => fetchStation(),
    refetchInterval: 30_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <ManagerShell stationName={stationName}>
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading station status…
        </div>
      </ManagerShell>
    );
  }

  if (isError || !data) {
    return (
      <ManagerShell stationName={stationName}>
        <Blocked
          title="Couldn't load station"
          message="We couldn't load your station's live status right now. Try again in a moment."
        />
      </ManagerShell>
    );
  }

  return (
    <ManagerShell stationName={stationName}>
      <ManagerStationCard station={data} isRefreshing={isFetching} onRefresh={() => refetch()} />
      <ManagerReportForm />
    </ManagerShell>
  );
}

function ManagerStationCard({
  station,
  isRefreshing,
  onRefresh,
}: {
  station: StationDetails;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const status = station.live_status;
  const level = statusLevel(station);
  const offered = offeredFuels(station);
  const availableNow = liveFuelAvailability(station);
  const now = useServerNow();

  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2 className="size-5" aria-hidden="true" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your station</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{station.name || "Unnamed station"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {[station.company, station.city].filter(Boolean).join(" · ") || "—"}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
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
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={isRefreshing ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <dl className="mt-4 divide-y divide-border border-t border-border">
        <Row icon={<MapPin className="size-4" />} label="City" value={station.city || "—"} />
        <Row icon={<Fuel className="size-4" />} label="Fuel types offered" value={<FuelChips fuels={offered} />} />
        <Row
          icon={<Fuel className="size-4" />}
          label="Available now"
          value={<FuelList fuels={availableNow} empty="None right now" />}
        />
        <Row icon={<Clock className="size-4" />} label="Opening time" value={formatTime(station.open_time)} />
        <Row icon={<Clock className="size-4" />} label="Closing time" value={formatTime(station.close_time)} />
        <Row
          icon={<Users className="size-4" />}
          label="Queue"
          value={
            !status || !status.power_status
              ? "Unavailable"
              : `${queueLabel(status.queue_minutes)}${
                  status.queue_minutes !== null ? ` · ~${Math.max(0, Math.round(status.queue_minutes))} min` : ""
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
        {status ? formatUpdatedLabel(status.updated_at, now) : "No live status reported yet"}
      </p>
    </section>
  );
}

function FuelChips({ fuels }: { fuels: string[] }) {
  if (fuels.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {fuels.map((fuel) => (
        <span
          key={fuel}
          className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-card-foreground"
        >
          {fuel}
        </span>
      ))}
    </div>
  );
}

function FuelList({ fuels, empty }: { fuels: { fuel: string; limited: boolean }[]; empty: string }) {
  if (fuels.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul className="mt-1 space-y-1">
      {fuels.map(({ fuel, limited }) => (
        <li key={fuel} className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: limited ? STATUS_COLORS.yellow : STATUS_COLORS.green }}
            aria-hidden="true"
          />
          <span>
            {fuel}
            {limited ? <span className="text-muted-foreground"> (Limited)</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
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

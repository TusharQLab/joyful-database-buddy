import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Star, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/station/FavoriteButton";
import { favoriteStationsQueryOptions } from "@/lib/favorites";
import {
  availableFuels,
  formatUpdatedLabel,
  statusLevel,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/stations";
import { useServerNow } from "@/lib/server-time";
import { useManagerGuard } from "@/hooks/useManagerGuard";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({
    meta: [
      { title: "My Stations — Saved Fuel & CNG Stops | Fuelio" },
      {
        name: "description",
        content:
          "Your saved Fuelio stations with live fuel availability, queue times and power status in one watchlist.",
      },
      { property: "og:title", content: "My Stations — Saved Fuel & CNG Stops | Fuelio" },
      {
        property: "og:description",
        content: "Track live availability for the fuel and CNG stations you saved.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  useManagerGuard();
  const { data, isPending, isError, error } = useQuery(favoriteStationsQueryOptions);
  const now = useServerNow();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="flex-1 text-base font-semibold tracking-tight text-foreground">My Stations</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/app">Map</Link>
        </Button>
      </header>

      <main className="px-4 py-5 sm:py-8">
        {isPending ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading your saved stations…</p>
          </div>
        ) : isError ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <TriangleAlert className="size-6 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Couldn't load your saved stations</p>
            <p className="text-xs">
              {error instanceof Error ? error.message : "Please check your connection and try again."}
            </p>
          </div>
        ) : data.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Star className="size-6" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No saved stations yet</p>
            <p className="text-xs">Tap Save on a station's details page to add it here.</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/app">Browse the map</Link>
            </Button>
          </div>
        ) : (
          <ul className="mx-auto w-full max-w-2xl space-y-3">
            {data.map((station) => {
              const level = statusLevel(station);
              const fuels = availableFuels(station);
              return (
                <li
                  key={station.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to="/station/$stationId"
                        params={{ stationId: station.id }}
                        className="text-sm font-semibold text-card-foreground hover:underline"
                      >
                        {station.name || "Unnamed station"}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[station.company, station.city].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-card-foreground"
                      style={{ backgroundColor: `${STATUS_COLORS[level]}1a` }}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[level] }}
                        aria-hidden="true"
                      />
                      {STATUS_LABELS[level]}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {fuels.length ? `Available: ${fuels.join(", ")}` : "Nothing available right now"}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-muted-foreground">
                      {station.live_status
                        ? formatUpdatedLabel(station.live_status.updated_at, now)
                        : "No live status yet"}
                    </span>
                    <FavoriteButton stationId={station.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, MapPinOff, TriangleAlert } from "lucide-react";
import { stationsQueryOptions } from "@/lib/stations";
import { stationsAlongRoute } from "@/lib/route";
import { RouteSearchPanel, type RouteSearchState } from "./RouteSearchPanel";
import { RouteStationList } from "./RouteStationList";
import { useIsMobile } from "@/hooks/use-mobile";


const StationMap = lazy(() => import("./StationMap"));


function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/40 px-6 text-center">
      {children}
    </div>
  );
}

function MapLoading() {
  return (
    <Centered>
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading stations…</p>
      </div>
    </Centered>
  );
}

export function MapPanel() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data, isPending, isError, error } = useQuery(stationsQueryOptions);
  const [routeState, setRouteState] = useState<RouteSearchState | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);


  const routeStations = useMemo(() => {
    if (!routeState || !data) return null;
    return stationsAlongRoute(data, routeState.route.coordinates);
  }, [routeState, data]);

  if (isPending) return <MapLoading />;

  if (isError) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Couldn't load stations</p>
          <p className="max-w-xs text-xs">
            {error instanceof Error ? error.message : "Please check your connection and try again."}
          </p>
        </div>
      </Centered>
    );
  }

  if (!data.length) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <MapPinOff className="size-5" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No stations yet</p>
          <p className="text-xs">Stations will appear here once they're added.</p>
        </div>
      </Centered>
    );
  }

  const openStation = (stationId: string) =>
    navigate({ to: "/station/$stationId", params: { stationId } });

  if (isMobile) {
    return (
      <>
        <ClientOnly fallback={<MapLoading />}>
          <Suspense fallback={<MapLoading />}>
            <StationMap
              stations={routeStations ?? data}
              route={routeState?.route.coordinates ?? null}
              onSelect={openStation}
            />
          </Suspense>
        </ClientOnly>

        <div className="pointer-events-none absolute left-14 right-3 top-3 z-[600]">
          <RouteSearchPanel
            active={routeState}
            matchedCount={routeStations?.length ?? 0}
            onResult={setRouteState}
            onClear={() => setRouteState(null)}
            compact
          />
        </div>

        {routeState && routeStations ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[600]">
            <RouteStationList
              stations={routeStations}
              onSelect={openStation}
              variant="sheet"
              expanded={sheetExpanded}
              onToggle={() => setSheetExpanded((v) => !v)}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ClientOnly fallback={<MapLoading />}>
        <Suspense fallback={<MapLoading />}>
          <StationMap
            stations={routeStations ?? data}
            route={routeState?.route.coordinates ?? null}
            onSelect={openStation}
          />
        </Suspense>
      </ClientOnly>
      <div className="pointer-events-none absolute bottom-4 left-14 right-3 top-3 z-[600] flex flex-col gap-2 sm:right-auto sm:w-80">
        <RouteSearchPanel
          active={routeState}
          matchedCount={routeStations?.length ?? 0}
          onResult={setRouteState}
          onClear={() => setRouteState(null)}
        />
        {routeState && routeStations ? (
          <RouteStationList stations={routeStations} onSelect={openStation} />
        ) : null}
      </div>

    </>
  );

}


import { useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchOrigin } from "@/lib/station-search";

/**
 * Single search bar for stations: name, company, city, fuel type and an
 * optional "within N km" radius around the user's current location.
 */
export function StationSearchPanel({
  query,
  onQueryChange,
  needsLocation,
  origin,
  onOrigin,
  resultCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  needsLocation: boolean;
  origin: SearchOrigin;
  onOrigin: (origin: SearchOrigin) => void;
  resultCount: number | null;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function shareLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Your browser can't share a location.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Location access was denied, so distance search can't run.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="pointer-events-auto shrink-0 rounded-2xl border border-border bg-card/95 p-2 shadow-md backdrop-blur">
      <div className="flex items-center gap-2">
        <Search className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder='Search "BPCL", "CNG pump within 5 km"'
          aria-label="Search stations"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => {
              onQueryChange("");
              setError(null);
            }}
            aria-label="Clear search"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {query ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1 pb-1">
          <p className="text-xs text-muted-foreground">
            {resultCount === null ? "" : `${resultCount} station${resultCount === 1 ? "" : "s"} found`}
          </p>
          {needsLocation && !origin ? (
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={shareLocation}>
              {locating ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <MapPin className="size-3.5" aria-hidden="true" />
              )}
              Use my location
            </Button>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

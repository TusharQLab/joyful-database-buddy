import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Fuel, LogOut } from "lucide-react";
import { MapPanel } from "@/components/map/MapPanel";
import { STATUS_COLORS } from "@/lib/stations";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Fuelio Map — Live Fuel & CNG Availability" },
      {
        name: "description",
        content:
          "Interactive map of nearby fuel and CNG stations with live availability and queue times.",
      },
      { property: "og:title", content: "Fuelio Map — Live Fuel & CNG Availability" },
      {
        property: "og:description",
        content: "See live fuel and CNG station availability on an interactive map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppHome,
});

const LEGEND = [
  { level: "green" as const, label: "Available, low queue" },
  { level: "yellow" as const, label: "Available, busy" },
  { level: "red" as const, label: "Closed / unavailable" },
];

function AppHome() {
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
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Fuel className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight text-foreground">Fuelio</h1>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} disabled={busy}>
          <LogOut className="size-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{busy ? "Logging out…" : "Log out"}</span>
        </Button>
      </header>

      <main className="relative min-h-0 flex-1">
        <MapPanel />
        <div className="pointer-events-none absolute bottom-4 left-3 z-[500] rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <ul className="space-y-1">
            {LEGEND.map((item) => (
              <li key={item.level} className="flex items-center gap-2 text-[11px] text-card-foreground">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[item.level] }}
                  aria-hidden="true"
                />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}

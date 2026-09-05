import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Fuel, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getManagerAccess, type ManagerAccess } from "@/lib/manager.functions";

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

function ManagerShell({ children }: { children: React.ReactNode }) {
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
          <h1 className="text-base font-semibold tracking-tight text-foreground">Fuelio Manager</h1>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
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

  return (
    <ManagerShell>
      <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="size-5" aria-hidden="true" />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your station
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">{access.station.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {[access.station.company, access.station.city].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Station management tools are coming soon. You'll only ever see and manage this station.
        </p>
      </section>
    </ManagerShell>
  );
}

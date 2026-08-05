import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Fuel, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Your Fuelio Account" },
      { name: "description", content: "Your signed-in Fuelio home for live fuel and CNG availability." },
      { property: "og:title", content: "Your Fuelio Account" },
      { property: "og:description", content: "Your signed-in Fuelio home." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppHome,
});

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Fuel className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">Welcome to Fuelio</h1>
        <p className="mt-2 text-sm text-muted-foreground">Signed in as</p>
        <p className="mt-1 break-all text-sm font-medium text-foreground">{user?.email}</p>

        <Button variant="outline" className="mt-6 w-full" onClick={handleSignOut} disabled={busy}>
          <LogOut className="size-4" aria-hidden="true" />
          {busy ? "Logging out…" : "Log out"}
        </Button>
      </div>
    </main>
  );
}

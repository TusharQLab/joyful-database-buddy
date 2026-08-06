import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPinOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StationDetailsCard } from "@/components/station/StationDetailsCard";
import { stationQueryOptions } from "@/lib/stations";

export const Route = createFileRoute("/_authenticated/station/$stationId")({
  head: () => ({
    meta: [
      { title: "Station Details — Fuelio" },
      {
        name: "description",
        content:
          "Full details for a fuel or CNG station: availability, queue time, power status, hours and last update.",
      },
      { property: "og:title", content: "Station Details — Fuelio" },
      {
        property: "og:description",
        content: "Live availability, queue time and power status for this fuel or CNG station.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StationDetailsPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <span className="text-sm font-medium text-muted-foreground">Station details</span>
      </header>
      <main className="px-4 py-5 sm:py-8">{children}</main>
    </div>
  );
}

function Message({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs">{body}</p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to="/app">Back to map</Link>
      </Button>
    </div>
  );
}

function StationDetailsPage() {
  const { stationId } = Route.useParams();
  const { data, isPending, isError, error } = useQuery(stationQueryOptions(stationId));

  if (isPending) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading station…</p>
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <Message
          icon={<TriangleAlert className="size-6 text-destructive" aria-hidden="true" />}
          title="Couldn't load this station"
          body={error instanceof Error ? error.message : "Please check your connection and try again."}
        />
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <Message
          icon={<MapPinOff className="size-6" aria-hidden="true" />}
          title="Station not found"
          body="This station may have been removed or the link is incorrect."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <StationDetailsCard station={data} />
    </Shell>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fuelio — Real-Time Fuel & CNG Station Availability" },
      {
        name: "description",
        content:
          "Fuelio shows drivers live fuel and CNG station availability, queues and opening hours. Sign in to get started.",
      },
      { property: "og:title", content: "Fuelio — Real-Time Fuel & CNG Availability" },
      {
        property: "og:description",
        content: "Live fuel and CNG station availability for drivers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/app" : "/auth", replace: true });
  },
  component: () => null,
});

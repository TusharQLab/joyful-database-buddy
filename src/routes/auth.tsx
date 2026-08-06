import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fuel, Loader2, MailCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in to Fuelio — Live Fuel & CNG Availability" },
      {
        name: "description",
        content:
          "Sign in to Fuelio with a secure one-time email link to track live fuel and CNG station availability near you.",
      },
      { property: "og:title", content: "Sign in to Fuelio" },
      {
        property: "og:description",
        content: "Passwordless sign-in for real-time fuel and CNG station availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app", replace: true });
  }, [loading, session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSending(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (otpError) {
        setError(otpError.message || "We couldn't send your link. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Fuel className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome to Fuelio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Live fuel &amp; CNG availability near you. Sign in with your email — no password needed.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-base font-medium text-card-foreground">Check your inbox</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. Open
                it on this device to continue. Links expire after a short while.
              </p>
              <Button
                variant="outline"
                className="mt-5 w-full"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                  aria-invalid={!!error}
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Sending link…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                New here? Entering your email creates your Fuelio account automatically.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

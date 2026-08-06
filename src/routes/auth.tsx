import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
const COOLDOWN_SECONDS = 45;
const LAST_EMAIL_KEY = "fuelio.lastSignInEmail";

function readLinkError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get("error_code") ?? query.get("error_code");
  const err = hash.get("error") ?? query.get("error");
  const description = hash.get("error_description") ?? query.get("error_description");
  if (!code && !err) return null;

  // Clean the URL so the message doesn't reappear on refresh.
  window.history.replaceState({}, "", window.location.pathname);

  if (code === "otp_expired") {
    return "That sign-in link has expired. Enter your email below to get a brand-new link.";
  }
  if (code === "access_denied" || err === "access_denied") {
    return "That sign-in link is no longer valid. Request a new one below.";
  }
  return description?.replace(/\+/g, " ") ?? "That sign-in link couldn't be used. Please request a new one.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Surface expired/invalid link errors, and prefill the last-used email.
  useEffect(() => {
    const linkError = readLinkError();
    if (linkError) setError(linkError);
    const saved = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  // Already authenticated → straight into the app.
  useEffect(() => {
    if (!loading && session) navigate({ to: "/app", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const sendLink = useCallback(
    async (value: string) => {
      setError(null);
      setNotice(null);

      if (!EMAIL_RE.test(value)) {
        setError("Please enter a valid email address.");
        return;
      }

      setSending(true);
      try {
        // Always request a brand-new link; never reuse a previously issued one.
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: value,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            shouldCreateUser: true,
          },
        });

        if (otpError) {
          const message = otpError.message ?? "";
          if (/rate|too many|seconds/i.test(message)) {
            setError("Too many requests. Please wait a moment before asking for another link.");
            startCooldown();
          } else {
            setError(message || "We couldn't send your link. Please try again.");
          }
          return;
        }

        window.localStorage.setItem(LAST_EMAIL_KEY, value);
        setSent(true);
        setNotice("A new sign-in link has been sent.");
        startCooldown();
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setSending(false);
      }
    },
    [startCooldown],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendLink(email.trim());
  }

  if (loading || session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {session ? "You're already signed in — taking you to Fuelio…" : "Restoring your session…"}
        </div>
      </main>
    );
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
                {notice ?? "A new sign-in link has been sent."} We emailed{" "}
                <span className="font-medium text-foreground">{email}</span>. Open the link on this device
                to continue — it expires after a short while.
              </p>

              {error ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button
                className="mt-5 w-full"
                disabled={sending || cooldown > 0}
                onClick={() => sendLink(email.trim())}
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Sending sign-in link…
                  </>
                ) : cooldown > 0 ? (
                  `Resend sign-in link in ${cooldown}s`
                ) : (
                  "Resend sign-in link"
                )}
              </Button>

              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => {
                  setSent(false);
                  setError(null);
                  setNotice(null);
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

              <Button type="submit" className="w-full" disabled={sending || cooldown > 0}>
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Sending sign-in link…
                  </>
                ) : cooldown > 0 ? (
                  `Try again in ${cooldown}s`
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

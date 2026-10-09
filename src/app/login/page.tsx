"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sign in.
 *
 * Rendered outside the usual shell: the shell hydrates the whole dataset, and
 * that request is refused until there is a session.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    void fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
      .then(async (response) => {
        const result = (await response.json()) as { ok: boolean; error?: string };
        if (!result.ok) {
          setError(result.error ?? "Could not sign in.");
          setBusy(false);
          return;
        }
        // A full reload, so the shell hydrates with the session in place.
        window.location.href = params.get("next") || "/";
      })
      .catch(() => {
        setError("Could not reach the server.");
        setBusy(false);
      });
  };

  void router;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="space-y-1.5 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <KeyRound className="size-5" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight">Cadence</h1>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            This workspace holds real client information. Enter the password to continue.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="text-[12px] font-medium text-danger">{error}</p> : null}
        </div>

        <Button type="submit" className="w-full" disabled={busy || password === ""}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {busy ? "Checking…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

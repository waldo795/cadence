"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { hydrate, isHydrated, setWriteErrorHandler } from "@/services/storage";
import { Button } from "@/components/ui/button";

/**
 * Blocks rendering until the dataset has loaded.
 *
 * Every component below reads its data synchronously, which is what keeps the
 * simulation engine and the trigger evaluator simple. That only holds if the
 * cache is populated before the first render, so the gate is deliberate rather
 * than a loading nicety — rendering early would throw.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<"loading" | "ready" | "error">(() =>
    isHydrated() ? "ready" : "loading",
  );
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(() => {
    hydrate()
      .then(() => setState("ready"))
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Could not reach the server.");
        setState("error");
      });
  }, []);

  React.useEffect(() => {
    setWriteErrorHandler((detail) =>
      toast.error("Change not saved", {
        description: `${detail} Your last edit may only exist on screen — reload to see what was stored.`,
      }),
    );
  }, []);

  // Kicked off once. `load` only sets state from the promise callbacks, never
  // synchronously, so this does not cascade renders.
  React.useEffect(() => {
    if (!isHydrated()) load();
  }, [load]);

  const retry = () => {
    setState("loading");
    load();
  };

  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md space-y-3 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <AlertTriangle className="size-5" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight">Could not load your data</h1>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{message}</p>
          <Button size="sm" onClick={retry}>
            <RotateCcw /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <span className="size-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
          Loading your data…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

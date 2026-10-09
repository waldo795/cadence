"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { hydrate, isHydrated, setWriteErrorHandler } from "@/services/storage";
import { Button } from "@/components/ui/button";
import { SendingBanner } from "./sending-controls";
import { Sidebar } from "./sidebar";

/**
 * Routes that must render without any data.
 *
 * Signing in is the obvious one, and getting this wrong deadlocks the whole
 * app: the provider wraps every page, so without the exception `/login` tries
 * to hydrate, is refused because nobody is signed in yet, and shows the error
 * screen *instead of the login form* — leaving no way to sign in at all.
 */
const UNAUTHENTICATED_ROUTES = ["/login", "/unsubscribe"];

/**
 * Blocks rendering until the dataset has loaded.
 *
 * Every component below reads its data synchronously, which is what keeps the
 * simulation engine and the trigger evaluator simple. That only holds if the
 * cache is populated before the first render, so the gate is deliberate rather
 * than a loading nicety — rendering early would throw.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const needsData = !UNAUTHENTICATED_ROUTES.includes(pathname);

  const [state, setState] = React.useState<"loading" | "ready" | "error">(() =>
    isHydrated() ? "ready" : "loading",
  );
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(() => {
    hydrate()
      .then(() => setState("ready"))
      .catch((error: unknown) => {
        // An expired or missing session is not an error worth a screen — it
        // just means signing in again.
        if (error instanceof Error && error.name === "Unauthorized") {
          /*
           * A full load, not router.push. The module-level cache has to be
           * discarded on the way out, and the proxy needs to see the request
           * so it can set up the redirect back afterwards.
           */
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
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
    if (needsData && !isHydrated()) load();
  }, [load, needsData]);

  const retry = () => {
    setState("loading");
    load();
  };

  if (!needsData) return <>{children}</>;

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

  /*
   * The navigation lives here rather than in the layout, so it only appears
   * once there is a session and data behind it. Rendering it around the login
   * page would show a signed-out visitor the whole menu, every item of which
   * bounces straight back to signing in.
   */
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Above the sidebar rather than inside the page, so no route can omit it. */}
      <SendingBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="scroll-slim flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

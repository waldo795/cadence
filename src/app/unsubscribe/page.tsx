"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

/**
 * The page an unsubscribe link lands on.
 *
 * Standalone: no sidebar, no data loading, no sign-in. The person here is a
 * client, not an operator, and the only thing they came to do is stop the
 * emails. Everything else on the page would be in the way.
 */
export default function UnsubscribePage() {
  return (
    <React.Suspense fallback={null}>
      <UnsubscribeForm />
    </React.Suspense>
  );
}

function UnsubscribeForm() {
  const params = useSearchParams();
  const profileId = params.get("p");
  const token = params.get("t");

  const [state, setState] = React.useState<"ready" | "working" | "done" | "error">("ready");
  const [message, setMessage] = React.useState("");

  const unsubscribe = async () => {
    setState("working");
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, token }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; email?: string }
        | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Something went wrong. Please reply to the email instead.");
        setState("error");
        return;
      }
      setMessage(payload?.email ?? "");
      setState("done");
    } catch {
      setMessage("Could not reach the server. Please reply to the email instead.");
      setState("error");
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f4f1ee",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "460px",
          width: "100%",
          background: "#ffffff",
          borderRadius: "10px",
          padding: "32px",
          color: "#2b2724",
        }}
      >
        {state === "done" ? (
          <>
            <h1 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: 600 }}>
              You have been unsubscribed
            </h1>
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6, color: "#5c5550" }}>
              {message ? `${message} will no longer receive marketing emails. ` : ""}
              If you have a booking with us, we will still be in touch about it directly.
            </p>
          </>
        ) : state === "error" ? (
          <>
            <h1 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: 600 }}>
              That link did not work
            </h1>
            <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6, color: "#5c5550" }}>
              {message}
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: "0 0 10px", fontSize: "20px", fontWeight: 600 }}>
              Unsubscribe from these emails?
            </h1>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "15px",
                lineHeight: 1.6,
                color: "#5c5550",
              }}
            >
              You will stop receiving marketing emails. If you have a booking with us, we will
              still be in touch about it directly.
            </p>
            <button
              type="button"
              onClick={() => void unsubscribe()}
              disabled={state === "working" || !profileId || !token}
              style={{
                display: "inline-block",
                padding: "12px 24px",
                border: 0,
                borderRadius: "6px",
                background: "#8c6f5e",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: state === "working" ? "default" : "pointer",
                opacity: state === "working" || !profileId || !token ? 0.6 : 1,
              }}
            >
              {state === "working" ? "One moment…" : "Yes, unsubscribe me"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

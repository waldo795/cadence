import { NextResponse } from "next/server";
import { ensureSeeded } from "@/server/seed-db";
import { listEvents, listMessages, listProfiles, readAllDocuments } from "@/server/store";
import type { Snapshot } from "@/shared/keys";

// node:sqlite is unavailable on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The whole dataset in one response.
 *
 * The client hydrates from this once at start-up and then reads synchronously
 * from an in-memory cache, which is what lets the existing components keep
 * their synchronous data access. At this size — hundreds of records — a single
 * snapshot is far cheaper than the round trips a per-collection API would cost.
 */
export async function GET() {
  ensureSeeded();

  const snapshot: Snapshot = {
    profiles: listProfiles(),
    events: listEvents(),
    messages: listMessages(),
    documents: readAllDocuments(),
  };

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

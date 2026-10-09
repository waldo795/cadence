import { NextResponse } from "next/server";
import { ensureSeeded } from "@/server/seed-db";
import { listEvents, listMessages, listProfiles, readAllDocuments } from "@/server/store";
import type { Snapshot } from "@/shared/keys";

// The Postgres drivers need Node APIs; they do not run on the edge runtime.
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
  await ensureSeeded();

  const [profiles, events, messages, documents] = await Promise.all([
    listProfiles(),
    listEvents(),
    listMessages(),
    readAllDocuments(),
  ]);

  const snapshot: Snapshot = { profiles, events, messages, documents };

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

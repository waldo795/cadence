import { NextResponse } from "next/server";
import { countInstancesByStatus, listInstances } from "@/server/instances";
import { ensureSeeded } from "@/server/seed-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live instances.
 *
 * Served separately from the main snapshot because this changes as the
 * scheduler runs, whereas the snapshot is hydrated once at start-up. The
 * instances view polls this.
 */
export async function GET() {
  await ensureSeeded();

  const [instances, counts] = await Promise.all([
    listInstances(),
    countInstancesByStatus(),
  ]);

  return NextResponse.json(
    { instances, counts },
    { headers: { "Cache-Control": "no-store" } },
  );
}

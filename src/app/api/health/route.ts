import { NextResponse } from "next/server";
import { db, describeConnection } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for the host and for the uptime monitor.
 *
 * It actually queries the database rather than just returning 200. A container
 * that is running but cannot reach Postgres is not healthy, and reporting it as
 * such would route real traffic at it.
 *
 * Public on purpose — the middleware lets it through so a monitor can reach it
 * without a session. It reveals nothing beyond whether the service is up.
 */
export async function GET() {
  const started = Date.now();

  try {
    const handle = await db();
    await handle.query("SELECT 1");

    return NextResponse.json(
      {
        ok: true,
        database: describeConnection(),
        latencyMs: Date.now() - started,
        configured: {
          // Whether each is set, never the values themselves.
          databaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
          appPassword: Boolean(process.env.APP_PASSWORD?.trim()),
          cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
          intakeOrigins: Boolean(process.env.INTAKE_ALLOWED_ORIGINS?.trim()),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Database unreachable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

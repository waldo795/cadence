import type { JourneyInstance, InstanceStatus } from "@/domain/instance";
import { db, DEFAULT_TENANT } from "./db";

/**
 * Journey instance storage.
 *
 * The scheduler asks exactly one question — "what is due?" — so that query is
 * the one the schema is shaped around: a partial index over `wake_at` covering
 * only waiting rows.
 */

function parse(row: { doc: unknown }): JourneyInstance {
  return row.doc as JourneyInstance;
}

const UPSERT = `
  INSERT INTO journey_instances
    (id, tenant_id, profile_id, journey_key, journey_id, status,
     current_node_id, wake_at, entered_at, updated_at, completed_at, doc)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (id) DO UPDATE SET
    status          = EXCLUDED.status,
    current_node_id = EXCLUDED.current_node_id,
    wake_at         = EXCLUDED.wake_at,
    updated_at      = EXCLUDED.updated_at,
    completed_at    = EXCLUDED.completed_at,
    doc             = EXCLUDED.doc
`;

function params(instance: JourneyInstance): unknown[] {
  return [
    instance.id,
    DEFAULT_TENANT,
    instance.profileId,
    instance.journeyKey,
    instance.journeyId,
    instance.status,
    instance.currentNodeId,
    instance.wakeAt,
    instance.enteredAt,
    instance.updatedAt,
    instance.completedAt,
    JSON.stringify(instance),
  ];
}

export async function saveInstance(instance: JourneyInstance): Promise<void> {
  const handle = await db();
  await handle.query(UPSERT, params(instance));
}

export async function listInstances(limit = 500): Promise<JourneyInstance[]> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM journey_instances WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT $2",
    [DEFAULT_TENANT, limit],
  );
  return rows.map(parse);
}

export async function instancesForProfile(profileId: string): Promise<JourneyInstance[]> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM journey_instances WHERE tenant_id = $1 AND profile_id = $2 ORDER BY entered_at DESC",
    [DEFAULT_TENANT, profileId],
  );
  return rows.map(parse);
}

/** The live instance for this profile on this journey, if any. */
export async function activeInstance(
  profileId: string,
  journeyKey: string,
): Promise<JourneyInstance | null> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    `SELECT doc FROM journey_instances
     WHERE tenant_id = $1 AND profile_id = $2 AND journey_key = $3
       AND status IN ('running', 'waiting')
     LIMIT 1`,
    [DEFAULT_TENANT, profileId, journeyKey],
  );
  return rows[0] ? parse(rows[0]) : null;
}

/**
 * Instances whose wake time has passed.
 *
 * `LIMIT` is deliberate: a scheduler tick should take a bounded slice rather
 * than attempt an unbounded backlog and time out part-way through, leaving an
 * unpredictable amount of work done.
 */
export async function dueInstances(now: Date, limit = 200): Promise<JourneyInstance[]> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    `SELECT doc FROM journey_instances
     WHERE tenant_id = $1 AND status = 'waiting' AND wake_at IS NOT NULL AND wake_at <= $2
     ORDER BY wake_at ASC
     LIMIT $3`,
    [DEFAULT_TENANT, now.toISOString(), limit],
  );
  return rows.map(parse);
}

export async function countInstancesByStatus(): Promise<Record<InstanceStatus, number>> {
  const handle = await db();
  const rows = await handle.query<{ status: string; n: string }>(
    "SELECT status, COUNT(*) AS n FROM journey_instances WHERE tenant_id = $1 GROUP BY status",
    [DEFAULT_TENANT],
  );
  const counts = {
    running: 0,
    waiting: 0,
    completed: 0,
    exited: 0,
    failed: 0,
  } as Record<InstanceStatus, number>;
  for (const row of rows) {
    if (row.status in counts) counts[row.status as InstanceStatus] = Number(row.n);
  }
  return counts;
}

export async function clearInstances(): Promise<void> {
  const handle = await db();
  await handle.query("DELETE FROM journey_instances WHERE tenant_id = $1", [DEFAULT_TENANT]);
}

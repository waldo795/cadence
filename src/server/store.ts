import type { CustomerEvent } from "@/domain/event";
import type { MessageRecord } from "@/domain/message";
import type { Profile } from "@/domain/profile";
import { db, DEFAULT_TENANT } from "./db";

/**
 * Server-side reads and writes.
 *
 * Row-backed collections expose *targeted* operations — insert one, upsert one
 * — rather than "replace everything", because the callers that matter write
 * concurrently: the website intake endpoint and the trigger cron can both land
 * at the same moment, and a read-modify-write of a whole collection would
 * silently drop one of them.
 *
 * Document-backed configuration keeps whole-value semantics, which is all the
 * UI needs since it has exactly one writer.
 *
 * Every statement is scoped by tenant. There is one tenant today; the filter is
 * applied anyway so that adding a second cannot leak data through a query
 * somebody forgot to update.
 */

/**
 * `jsonb` is returned already parsed by both `pg` and PGlite, so this is a
 * cast, not a parse.
 *
 * Parsing defensively here is actively wrong: a document whose value is itself
 * a JSON string — `seededAt`, for instance — comes back as a plain string, and
 * running `JSON.parse` over it throws. That threw inside a `try/catch` and
 * silently dropped the key, which left the app falling back to "now" for the
 * seed date and quietly drifting every relative date in the demo.
 */
function parseDoc<T>(value: unknown): T {
  return value as T;
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

const UPSERT_PROFILE = `
  INSERT INTO profiles
    (id, tenant_id, customer_id, email, first_name, last_name,
     booking_status, wedding_date, created_at, updated_at, doc)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  ON CONFLICT (id) DO UPDATE SET
    customer_id    = EXCLUDED.customer_id,
    email          = EXCLUDED.email,
    first_name     = EXCLUDED.first_name,
    last_name      = EXCLUDED.last_name,
    booking_status = EXCLUDED.booking_status,
    wedding_date   = EXCLUDED.wedding_date,
    updated_at     = EXCLUDED.updated_at,
    doc            = EXCLUDED.doc
`;

function profileParams(profile: Profile): unknown[] {
  const weddingDate = profile.attributes?.weddingDate;
  return [
    profile.id,
    DEFAULT_TENANT,
    profile.customerId,
    profile.email ?? null,
    profile.firstName ?? null,
    profile.lastName ?? null,
    typeof profile.attributes?.bookingStatus === "string"
      ? profile.attributes.bookingStatus
      : null,
    isoOrNull(weddingDate),
    profile.createdAt,
    new Date().toISOString(),
    JSON.stringify(profile),
  ];
}

export async function listProfiles(): Promise<Profile[]> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM profiles WHERE tenant_id = $1 ORDER BY created_at DESC",
    [DEFAULT_TENANT],
  );
  return rows.map((row) => parseDoc<Profile>(row.doc));
}

export async function getProfile(id: string): Promise<Profile | null> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM profiles WHERE tenant_id = $1 AND id = $2",
    [DEFAULT_TENANT, id],
  );
  return rows[0] ? parseDoc<Profile>(rows[0].doc) : null;
}

export async function upsertProfile(profile: Profile): Promise<void> {
  const handle = await db();
  await handle.query(UPSERT_PROFILE, profileParams(profile));
}

export async function upsertProfiles(profiles: Profile[]): Promise<void> {
  if (profiles.length === 0) return;
  const handle = await db();
  await handle.transaction(async (tx) => {
    for (const profile of profiles) {
      await tx.query(UPSERT_PROFILE, profileParams(profile));
    }
  });
}

/** Finds an existing client by email so intake does not create duplicates. */
export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM profiles WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1",
    [DEFAULT_TENANT, email],
  );
  return rows[0] ? parseDoc<Profile>(rows[0].doc) : null;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

const INSERT_EVENT = `
  INSERT INTO events (id, tenant_id, profile_id, name, occurred_at, doc)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (id) DO NOTHING
`;

export async function listEvents(limit = 2000): Promise<CustomerEvent[]> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT $2",
    [DEFAULT_TENANT, limit],
  );
  return rows.map((row) => parseDoc<CustomerEvent>(row.doc));
}

export async function insertEvents(events: CustomerEvent[]): Promise<void> {
  if (events.length === 0) return;
  const handle = await db();
  await handle.transaction(async (tx) => {
    for (const event of events) {
      await tx.query(INSERT_EVENT, [
        event.id,
        DEFAULT_TENANT,
        event.profileId,
        event.name,
        event.occurredAt,
        JSON.stringify(event),
      ]);
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

const INSERT_MESSAGE = `
  INSERT INTO messages
    (id, tenant_id, profile_id, journey_key, message_key, channel, status, sent_at, doc)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (id) DO NOTHING
`;

export async function listMessages(limit = 2000): Promise<MessageRecord[]> {
  const handle = await db();
  const rows = await handle.query<{ doc: unknown }>(
    "SELECT doc FROM messages WHERE tenant_id = $1 ORDER BY sent_at DESC LIMIT $2",
    [DEFAULT_TENANT, limit],
  );
  return rows.map((row) => parseDoc<MessageRecord>(row.doc));
}

export async function insertMessages(messages: MessageRecord[]): Promise<void> {
  if (messages.length === 0) return;
  const handle = await db();
  await handle.transaction(async (tx) => {
    for (const message of messages) {
      await tx.query(INSERT_MESSAGE, [
        message.id,
        DEFAULT_TENANT,
        message.profileId,
        message.journeyKey ?? null,
        message.messageKey ?? null,
        message.channel,
        message.status,
        message.sentAt,
        JSON.stringify(message),
      ]);
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Documents (configuration)                                                  */
/* -------------------------------------------------------------------------- */

export async function readDocument<T>(key: string): Promise<T | null> {
  const handle = await db();
  const rows = await handle.query<{ value: unknown }>(
    "SELECT value FROM documents WHERE tenant_id = $1 AND key = $2",
    [DEFAULT_TENANT, key],
  );
  return rows[0] ? parseDoc<T>(rows[0].value) : null;
}

export async function writeDocument(key: string, value: unknown): Promise<void> {
  const handle = await db();
  await handle.query(
    `INSERT INTO documents (tenant_id, key, value, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at`,
    [DEFAULT_TENANT, key, JSON.stringify(value), new Date().toISOString()],
  );
}

export async function readAllDocuments(): Promise<Record<string, unknown>> {
  const handle = await db();
  const rows = await handle.query<{ key: string; value: unknown }>(
    "SELECT key, value FROM documents WHERE tenant_id = $1",
    [DEFAULT_TENANT],
  );
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = parseDoc(row.value);
    } catch {
      // A single corrupt document should not take down the whole snapshot.
    }
  }
  return result;
}

/** Wipes this tenant's data. Used by "reset demo data". */
export async function clearAll(): Promise<void> {
  const handle = await db();
  await handle.transaction(async (tx) => {
    for (const table of ["profiles", "events", "messages", "documents"]) {
      await tx.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [DEFAULT_TENANT]);
    }
  });
}

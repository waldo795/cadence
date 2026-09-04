import type { CustomerEvent } from "@/domain/event";
import type { MessageRecord } from "@/domain/message";
import type { Profile } from "@/domain/profile";
import { db } from "./db";

/**
 * Server-side reads and writes.
 *
 * Row-backed collections expose *targeted* operations (insert one, update one)
 * rather than "replace everything", because the callers that matter — the
 * intake endpoint and the trigger cron — write concurrently. Document-backed
 * config keeps whole-value semantics, which is all the UI needs.
 */

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

function profileColumns(profile: Profile) {
  const weddingDate = profile.attributes?.weddingDate;
  return {
    id: profile.id,
    customer_id: profile.customerId,
    email: profile.email ?? null,
    first_name: profile.firstName ?? null,
    last_name: profile.lastName ?? null,
    booking_status:
      typeof profile.attributes?.bookingStatus === "string"
        ? profile.attributes.bookingStatus
        : null,
    wedding_date: typeof weddingDate === "string" ? weddingDate : null,
    created_at: profile.createdAt,
    updated_at: new Date().toISOString(),
    doc: JSON.stringify(profile),
  };
}

export function listProfiles(): Profile[] {
  const rows = db()
    .prepare("SELECT doc FROM profiles ORDER BY created_at DESC")
    .all() as { doc: string }[];
  return rows.map((row) => JSON.parse(row.doc) as Profile);
}

export function getProfile(id: string): Profile | null {
  const row = db().prepare("SELECT doc FROM profiles WHERE id = ?").get(id) as
    | { doc: string }
    | undefined;
  return row ? (JSON.parse(row.doc) as Profile) : null;
}

/** Insert or replace one profile. Safe to call concurrently with others. */
export function upsertProfile(profile: Profile): void {
  const c = profileColumns(profile);
  db()
    .prepare(
      `INSERT INTO profiles
         (id, customer_id, email, first_name, last_name, booking_status, wedding_date, created_at, updated_at, doc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         customer_id = excluded.customer_id,
         email = excluded.email,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         booking_status = excluded.booking_status,
         wedding_date = excluded.wedding_date,
         updated_at = excluded.updated_at,
         doc = excluded.doc`,
    )
    .run(
      c.id,
      c.customer_id,
      c.email,
      c.first_name,
      c.last_name,
      c.booking_status,
      c.wedding_date,
      c.created_at,
      c.updated_at,
      c.doc,
    );
}

export function upsertProfiles(profiles: Profile[]): void {
  const connection = db();
  connection.exec("BEGIN");
  try {
    for (const profile of profiles) upsertProfile(profile);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

/** Finds an existing client by email, so intake does not create duplicates. */
export function findProfileByEmail(email: string): Profile | null {
  const row = db()
    .prepare("SELECT doc FROM profiles WHERE lower(email) = lower(?) LIMIT 1")
    .get(email) as { doc: string } | undefined;
  return row ? (JSON.parse(row.doc) as Profile) : null;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export function listEvents(limit = 2000): CustomerEvent[] {
  const rows = db()
    .prepare("SELECT doc FROM events ORDER BY occurred_at DESC LIMIT ?")
    .all(limit) as { doc: string }[];
  return rows.map((row) => JSON.parse(row.doc) as CustomerEvent);
}

export function insertEvents(events: CustomerEvent[]): void {
  if (events.length === 0) return;
  const connection = db();
  const statement = connection.prepare(
    `INSERT INTO events (id, profile_id, name, occurred_at, doc)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );
  connection.exec("BEGIN");
  try {
    for (const event of events) {
      statement.run(
        event.id,
        event.profileId,
        event.name,
        event.occurredAt,
        JSON.stringify(event),
      );
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

export function listMessages(limit = 2000): MessageRecord[] {
  const rows = db()
    .prepare("SELECT doc FROM messages ORDER BY sent_at DESC LIMIT ?")
    .all(limit) as { doc: string }[];
  return rows.map((row) => JSON.parse(row.doc) as MessageRecord);
}

export function insertMessages(messages: MessageRecord[]): void {
  if (messages.length === 0) return;
  const connection = db();
  const statement = connection.prepare(
    `INSERT INTO messages (id, profile_id, journey_key, message_key, channel, status, sent_at, doc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );
  connection.exec("BEGIN");
  try {
    for (const message of messages) {
      statement.run(
        message.id,
        message.profileId,
        message.journeyKey ?? null,
        message.messageKey ?? null,
        message.channel,
        message.status,
        message.sentAt,
        JSON.stringify(message),
      );
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Documents (configuration)                                                  */
/* -------------------------------------------------------------------------- */

export function readDocument<T>(key: string): T | null {
  const row = db().prepare("SELECT value FROM documents WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function writeDocument(key: string, value: unknown): void {
  db()
    .prepare(
      `INSERT INTO documents (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), new Date().toISOString());
}

export function readAllDocuments(): Record<string, unknown> {
  const rows = db().prepare("SELECT key, value FROM documents").all() as {
    key: string;
    value: string;
  }[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      // A corrupt document should not take down the whole snapshot.
    }
  }
  return result;
}

/** Wipes everything. Used by "reset demo data". */
export function clearAll(): void {
  const connection = db();
  connection.exec("BEGIN");
  try {
    connection.exec("DELETE FROM profiles");
    connection.exec("DELETE FROM events");
    connection.exec("DELETE FROM messages");
    connection.exec("DELETE FROM documents");
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

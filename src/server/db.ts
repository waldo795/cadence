import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The database.
 *
 * SQLite via `node:sqlite`, which ships with Node 24 — no native compilation
 * and no dependency to install, which matters on Windows where `better-sqlite3`
 * drags in Visual Studio build tools.
 *
 * Storage is deliberately split:
 *
 *  - **Rows** for profiles, events and messages. These grow without bound and,
 *    more importantly, are about to have *concurrent writers*: the website
 *    intake endpoint and the scheduled-trigger cron can both fire at once. A
 *    read-modify-write of a whole collection would silently drop one of them.
 *  - **Documents** for configuration — journeys, triggers, contact policy,
 *    experiments. Only the UI edits these, one at a time, and they are deeply
 *    nested structures that would need a large mapping layer to normalise for
 *    no practical gain at this size.
 *
 * The `doc` column holds the full domain object as JSON. The extracted columns
 * exist purely to be indexed and queried; `doc` remains the source of truth, so
 * adding a field to a domain type does not require a migration.
 */

let database: DatabaseSync | null = null;

function databasePath(): string {
  // Overridable so tests and future deployments can point elsewhere.
  const configured = process.env.CADENCE_DB_PATH;
  return configured ? resolve(configured) : resolve(process.cwd(), "data", "cadence.db");
}

export function db(): DatabaseSync {
  if (database) return database;

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  database = new DatabaseSync(path);
  // WAL lets a reader run while a writer is committing — relevant the moment
  // the cron and the intake endpoint overlap.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  migrate(database);
  return database;
}

/**
 * Schema migrations, applied in order and recorded so they run once.
 *
 * Deliberately plain SQL rather than a migration library: there is one
 * developer, the schema is small, and an extra dependency here would buy
 * nothing.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_initial",
    sql: `
      CREATE TABLE IF NOT EXISTS profiles (
        id             TEXT PRIMARY KEY,
        customer_id    TEXT NOT NULL,
        email          TEXT,
        first_name     TEXT,
        last_name      TEXT,
        booking_status TEXT,
        wedding_date   TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        doc            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_email        ON profiles(email);
      CREATE INDEX IF NOT EXISTS idx_profiles_wedding_date ON profiles(wedding_date);
      CREATE INDEX IF NOT EXISTS idx_profiles_status       ON profiles(booking_status);

      CREATE TABLE IF NOT EXISTS events (
        id          TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        doc         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_profile  ON events(profile_id);
      CREATE INDEX IF NOT EXISTS idx_events_name     ON events(name);
      CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at);

      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        journey_key TEXT,
        message_key TEXT,
        channel     TEXT,
        status      TEXT,
        sent_at     TEXT NOT NULL,
        doc         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_profile ON messages(profile_id);
      CREATE INDEX IF NOT EXISTS idx_messages_journey ON messages(journey_key);
      CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);

      CREATE TABLE IF NOT EXISTS documents (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

function migrate(connection: DatabaseSync): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (connection.prepare("SELECT name FROM migrations").all() as { name: string }[]).map(
      (row) => row.name,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    connection.exec(migration.sql);
    connection
      .prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)")
      .run(migration.name, new Date().toISOString());
  }
}

/** True when the database has never been populated. */
export function isEmpty(): boolean {
  const row = db().prepare("SELECT COUNT(*) AS n FROM profiles").get() as { n: number };
  const docs = db().prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number };
  return row.n === 0 && docs.n === 0;
}

/** Closes the connection. Used by scripts; the server keeps it open. */
export function closeDb(): void {
  database?.close();
  database = null;
}

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The database.
 *
 * Postgres, reached two ways:
 *
 *  - **`DATABASE_URL` set** — a real server (Supabase, Neon, anything) via the
 *    `pg` pool. This is production.
 *  - **unset** — PGlite, which is Postgres itself compiled to WebAssembly,
 *    running in-process against a local directory.
 *
 * PGlite is not an emulation or a shim: it is the actual Postgres engine, so
 * the SQL, the types and the transaction semantics are the same ones that run
 * in production. That is what makes it safe to develop and test against
 * without anyone installing a database — and it keeps the tested surface equal
 * to the shipped surface, because only the connection differs. Every statement
 * below this adapter is written once and runs on both.
 */

export interface QueryResult {
  rows: Record<string, unknown>[];
}

/** The narrow surface everything else uses. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(run: (tx: Db) => Promise<T>): Promise<T>;
}

/**
 * Every table is scoped by tenant from day one.
 *
 * There is only one tenant today. Adding the column later would mean a
 * migration across every table plus every query, so it costs nothing now and a
 * great deal later.
 */
export const DEFAULT_TENANT = process.env.CADENCE_TENANT_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Adapters                                                                   */
/* -------------------------------------------------------------------------- */

type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  connect: () => Promise<PgClient>;
};
type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

function wrapPgQueryable(queryable: {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
}): Omit<Db, "transaction"> {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await queryable.query(sql, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await queryable.query(sql);
    },
  };
}

async function createPgDb(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");

  // Hosted Postgres almost always requires TLS, and managed providers commonly
  // present a certificate the default chain will not verify. Opt out only when
  // the URL does not already say what it wants.
  const needsSsl = !/sslmode=/.test(connectionString);

  const pool = new Pool({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 10,
  }) as unknown as PgPool;

  const base = wrapPgQueryable(pool);

  return {
    ...base,
    async transaction<T>(run: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      const tx: Db = {
        ...wrapPgQueryable(client),
        // Nested transactions are not used; reuse the same client.
        transaction: async (inner) => inner(tx),
      };
      try {
        await client.query("BEGIN");
        const result = await run(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function createPgliteDb(): Promise<Db> {
  /*
   * PGlite writes to the local filesystem, which on most hosts is wiped on
   * every deploy and often between requests. Falling back to it in production
   * because DATABASE_URL was forgotten would appear to work and then quietly
   * lose every client, so refuse instead.
   */
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Refusing to start with a local database in production — " +
        "data would be lost on the next deploy. Point DATABASE_URL at a Postgres server.",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = resolve(process.cwd(), "data", "pg");
  mkdirSync(dir, { recursive: true });

  const client = await PGlite.create(dir);

  const wrap = (queryable: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<unknown>;
  }): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await queryable.query(sql, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await queryable.exec(sql);
    },
    async transaction<T>(run: (tx: Db) => Promise<T>): Promise<T> {
      // PGlite drives its own transaction; `exec` is unavailable on the handle,
      // so statements inside one go through `query`.
      return client.transaction(async (tx) =>
        run(
          wrap({
            query: (sql, params) => tx.query(sql, params),
            exec: (sql) => tx.query(sql),
          }),
        ),
      ) as Promise<T>;
    },
  });

  return wrap({
    query: (sql, params) => client.query(sql, params),
    exec: (sql) => client.exec(sql),
  });
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                 */
/* -------------------------------------------------------------------------- */

let connection: Promise<Db> | null = null;

export function db(): Promise<Db> {
  if (connection) return connection;

  const url = process.env.DATABASE_URL?.trim();
  connection = (url ? createPgDb(url) : createPgliteDb()).then(async (handle) => {
    await migrate(handle);
    return handle;
  });

  return connection;
}

export function describeConnection(): string {
  return process.env.DATABASE_URL?.trim()
    ? "Postgres (DATABASE_URL)"
    : "PGlite — local Postgres, data/pg";
}

/* -------------------------------------------------------------------------- */
/* Migrations                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Plain SQL, applied in order and recorded so each runs once.
 *
 * `doc` columns are `jsonb` rather than text: the full domain object stays the
 * source of truth, but it is queryable, so a future report does not need a new
 * column for every question. The extracted columns exist purely to be indexed.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_initial",
    sql: `
      CREATE TABLE IF NOT EXISTS profiles (
        id             TEXT PRIMARY KEY,
        tenant_id      TEXT NOT NULL,
        customer_id    TEXT NOT NULL,
        email          TEXT,
        first_name     TEXT,
        last_name      TEXT,
        booking_status TEXT,
        wedding_date   TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL,
        updated_at     TIMESTAMPTZ NOT NULL,
        doc            JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_tenant  ON profiles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_profiles_email   ON profiles(tenant_id, lower(email));
      CREATE INDEX IF NOT EXISTS idx_profiles_wedding ON profiles(tenant_id, wedding_date);
      CREATE INDEX IF NOT EXISTS idx_profiles_status  ON profiles(tenant_id, booking_status);

      CREATE TABLE IF NOT EXISTS events (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL,
        profile_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        doc         JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_tenant   ON events(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_events_profile  ON events(tenant_id, profile_id);
      CREATE INDEX IF NOT EXISTS idx_events_name     ON events(tenant_id, name);
      CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(tenant_id, occurred_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL,
        profile_id  TEXT NOT NULL,
        journey_key TEXT,
        message_key TEXT,
        channel     TEXT,
        status      TEXT,
        sent_at     TIMESTAMPTZ NOT NULL,
        doc         JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_tenant  ON messages(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_messages_profile ON messages(tenant_id, profile_id);
      CREATE INDEX IF NOT EXISTS idx_messages_journey ON messages(tenant_id, journey_key);
      CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(tenant_id, sent_at DESC);

      CREATE TABLE IF NOT EXISTS documents (
        tenant_id  TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (tenant_id, key)
      );
    `,
  },
  {
    name: "002_journey_instances",
    sql: `
      CREATE TABLE IF NOT EXISTS journey_instances (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL,
        profile_id      TEXT NOT NULL,
        journey_key     TEXT NOT NULL,
        journey_id      TEXT NOT NULL,
        status          TEXT NOT NULL,
        current_node_id TEXT,
        wake_at         TIMESTAMPTZ,
        entered_at      TIMESTAMPTZ NOT NULL,
        updated_at      TIMESTAMPTZ NOT NULL,
        completed_at    TIMESTAMPTZ,
        doc             JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_instances_tenant  ON journey_instances(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_instances_profile ON journey_instances(tenant_id, profile_id);
      CREATE INDEX IF NOT EXISTS idx_instances_journey ON journey_instances(tenant_id, journey_key);

      -- The scheduler's only query: what is due. Partial, because finished
      -- instances vastly outnumber waiting ones over time and should not be
      -- scanned on every tick.
      CREATE INDEX IF NOT EXISTS idx_instances_due
        ON journey_instances(tenant_id, wake_at)
        WHERE status = 'waiting';

      -- One live instance per profile per journey. Enforced in the database
      -- rather than only in code, because the intake endpoint and the cron can
      -- both try to start one at the same moment, and a duplicate would send
      -- every remaining message twice.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_instances_one_active
        ON journey_instances(tenant_id, profile_id, journey_key)
        WHERE status IN ('running', 'waiting');
    `,
  },
];

async function migrate(handle: Db): Promise<void> {
  await handle.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    );
  `);

  const applied = new Set(
    (await handle.query<{ name: string }>("SELECT name FROM migrations")).map(
      (row) => row.name,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    await handle.exec(migration.sql);
    await handle.query("INSERT INTO migrations (name, applied_at) VALUES ($1, $2)", [
      migration.name,
      new Date().toISOString(),
    ]);
  }
}

/** True when this tenant has no data yet. */
export async function isEmpty(): Promise<boolean> {
  const handle = await db();
  const [profiles] = await handle.query<{ n: string }>(
    "SELECT COUNT(*) AS n FROM profiles WHERE tenant_id = $1",
    [DEFAULT_TENANT],
  );
  const [documents] = await handle.query<{ n: string }>(
    "SELECT COUNT(*) AS n FROM documents WHERE tenant_id = $1",
    [DEFAULT_TENANT],
  );
  // Postgres returns COUNT as a string (bigint), so compare numerically.
  return Number(profiles.n) === 0 && Number(documents.n) === 0;
}

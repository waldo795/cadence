import type { CustomerEvent } from "@/domain/event";
import type { MessageRecord } from "@/domain/message";
import type { Profile } from "@/domain/profile";
import { DOCUMENT_KEYS, type Snapshot } from "@/shared/keys";

/**
 * Client-side data access, backed by the server.
 *
 * The whole dataset is fetched once at start-up into an in-memory cache. Reads
 * are then synchronous, which is what lets every existing component, the
 * simulation engine and the trigger evaluator keep working unchanged — none of
 * them were written to await their data, and at this size (hundreds of records)
 * a single snapshot is far cheaper than making them all async.
 *
 * Writes are optimistic: the cache updates immediately so the UI stays
 * responsive, and the change is POSTed in the background. A failed write is
 * surfaced rather than swallowed, because silently losing a client the user
 * just typed in would be worse than an error.
 */

interface Cache {
  profiles: Profile[];
  events: CustomerEvent[];
  messages: MessageRecord[];
  documents: Record<string, unknown>;
}

let cache: Cache | null = null;
let onWriteError: ((message: string) => void) | null = null;

/** Lets the app shell surface persistence failures as a toast. */
export function setWriteErrorHandler(handler: (message: string) => void): void {
  onWriteError = handler;
}

export function isHydrated(): boolean {
  return cache !== null;
}

export async function hydrate(): Promise<void> {
  const response = await fetch("/api/snapshot", { cache: "no-store" });
  if (!response.ok) {
    const error = new Error(`Could not load data (${response.status}).`);
    /*
     * Named so the shell can send the user to sign in rather than showing a
     * dead end. A 401 here means the session has expired or was never
     * established — not that anything is broken.
     */
    if (response.status === 401) error.name = "Unauthorized";
    throw error;
  }
  const snapshot = (await response.json()) as Snapshot;
  cache = {
    profiles: snapshot.profiles as Profile[],
    events: snapshot.events as CustomerEvent[],
    messages: snapshot.messages as MessageRecord[],
    documents: snapshot.documents ?? {},
  };
}

function requireCache(): Cache {
  if (!cache) {
    throw new Error(
      "Data was read before hydration finished. The app shell should block rendering until hydrate() resolves.",
    );
  }
  return cache;
}

async function post(body: unknown): Promise<void> {
  try {
    const response = await fetch("/api/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(detail?.error ?? `Save failed (${response.status}).`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed.";
    onWriteError?.(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export function readProfiles(): Profile[] {
  return requireCache().profiles;
}

/**
 * Upserts the given profiles only.
 *
 * Deliberately not "replace the whole list": the intake endpoint and the
 * trigger cron write profiles too, and a whole-collection write would clobber
 * whatever they had just done.
 */
export function persistProfiles(profiles: Profile[]): void {
  const store = requireCache();
  const byId = new Map(store.profiles.map((profile) => [profile.id, profile]));
  for (const profile of profiles) byId.set(profile.id, profile);
  store.profiles = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  void post({ kind: "upsertProfiles", profiles });
}

export function readEvents(): CustomerEvent[] {
  return requireCache().events;
}

export function persistEvents(events: CustomerEvent[]): void {
  if (events.length === 0) return;
  const store = requireCache();
  store.events = [...events, ...store.events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  void post({ kind: "appendEvents", events });
}

export function readMessages(): MessageRecord[] {
  return requireCache().messages;
}

export function persistMessages(messages: MessageRecord[]): void {
  if (messages.length === 0) return;
  const store = requireCache();
  store.messages = [...messages, ...store.messages].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  );
  void post({ kind: "appendMessages", messages });
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

export function readDoc<T>(key: string): T | null {
  const value = requireCache().documents[key];
  return value === undefined ? null : (value as T);
}

export function writeDoc(key: string, value: unknown): void {
  requireCache().documents[key] = value;
  void post({ kind: "writeDocument", key, value });
}

/** The demo dataset's reference date. Everything seeded derives from it. */
export function seededAt(): Date {
  const stored = readDoc<string>(DOCUMENT_KEYS.seededAt);
  return stored ? new Date(stored) : new Date();
}

/** Wipes the database, re-seeds it, and reloads the cache. */
export async function resetAll(): Promise<void> {
  await post({ kind: "reset" });
  await hydrate();
}

export { DOCUMENT_KEYS };

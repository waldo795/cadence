import { createHash } from "node:crypto";
import type { CustomerEvent } from "@/domain/event";
import type { ExperimentExposure } from "@/domain/experiment-results";
import type { MessageRecord } from "@/domain/message";
import type { JourneyParticipation } from "@/domain/participation";
import {
  EMPTY_COUNTS,
  type DataSubjectRequest,
  type ErasureCounts,
  type ErasureReceipt,
  type PersonalDataExport,
} from "@/domain/privacy";
import { DOCUMENT_KEYS } from "@/shared/keys";
import { db, DEFAULT_TENANT } from "./db";
import { instancesForProfile } from "./instances";
import { findProfileByEmail, getProfile, readDocument, writeDocument } from "./store";

/**
 * Servicing data subject requests.
 *
 * The whole point of this module is that it knows **every** place a person's
 * data lives. There are seven, and they are easy to get wrong:
 *
 *   profiles · events · messages · journey_instances        (rows)
 *   exposures · participations · firedTriggers              (documents)
 *
 * `firedTriggers` is the one that catches people out. It is an array of
 * strings shaped `triggerId:profileId:date`, so the identifier is embedded in
 * a key rather than sitting in a field — a sweep that iterates over object
 * properties will walk straight past it.
 *
 * If you add a store that references a profile, add it here too. The erasure
 * preview is the safeguard: it shows per-store counts before anything is
 * deleted, so an omission shows up as a suspicious zero.
 */

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

export async function matchProfile(email: string): Promise<string | null> {
  const profile = await findProfileByEmail(email);
  return profile?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Access and portability                                                     */
/* -------------------------------------------------------------------------- */

/** Everything held about one person, for them to read or take away. */
export async function collectPersonalData(
  profileId: string,
): Promise<PersonalDataExport | null> {
  const profile = await getProfile(profileId);
  if (!profile) return null;

  const handle = await db();

  const events = (
    await handle.query<{ doc: unknown }>(
      "SELECT doc FROM events WHERE tenant_id = $1 AND profile_id = $2 ORDER BY occurred_at DESC",
      [DEFAULT_TENANT, profileId],
    )
  ).map((row) => row.doc as CustomerEvent);

  const messages = (
    await handle.query<{ doc: unknown }>(
      "SELECT doc FROM messages WHERE tenant_id = $1 AND profile_id = $2 ORDER BY sent_at DESC",
      [DEFAULT_TENANT, profileId],
    )
  ).map((row) => row.doc as MessageRecord);

  const instances = await instancesForProfile(profileId);

  const exposures = ((await readDocument<ExperimentExposure[]>(DOCUMENT_KEYS.exposures)) ?? [])
    .filter((exposure) => exposure.profileId === profileId);

  const participations = (
    (await readDocument<JourneyParticipation[]>(DOCUMENT_KEYS.participations)) ?? []
  ).filter((participation) => participation.profileId === profileId);

  const fired = ((await readDocument<string[]>(DOCUMENT_KEYS.firedTriggers)) ?? []).filter(
    (key) => key.split(":")[1] === profileId,
  );

  return {
    generatedAt: new Date().toISOString(),
    subject: {
      profileId,
      email: profile.email,
      name: `${profile.firstName} ${profile.lastName}`.trim(),
    },
    explanation:
      "This is everything held about you. 'Events' are things that happened, such as submitting an enquiry. " +
      "'Messages' are communications prepared for you. 'Journey progress' is where you are in an automated " +
      "sequence. 'Reminders sent' records which scheduled reminders have already gone out, so they are not repeated.",
    client: profile,
    events,
    messages,
    journeyProgress: instances,
    experimentParticipation: exposures,
    journeyHistory: participations,
    remindersSent: fired,
  };
}

/* -------------------------------------------------------------------------- */
/* Erasure                                                                    */
/* -------------------------------------------------------------------------- */

async function countOne(sql: string, params: unknown[]): Promise<number> {
  const handle = await db();
  const [row] = await handle.query<{ n: string }>(sql, params);
  return Number(row?.n ?? 0);
}

/**
 * What an erasure would remove, without removing it.
 *
 * Always run before deleting. It is the only way to notice that a store has
 * been forgotten, because a missing sweep shows up here as a zero where you
 * expected a number.
 */
export async function planErasure(profileId: string): Promise<ErasureCounts> {
  const [profile, events, messages, instances] = await Promise.all([
    countOne("SELECT COUNT(*) AS n FROM profiles WHERE tenant_id = $1 AND id = $2", [
      DEFAULT_TENANT,
      profileId,
    ]),
    countOne(
      "SELECT COUNT(*) AS n FROM events WHERE tenant_id = $1 AND profile_id = $2",
      [DEFAULT_TENANT, profileId],
    ),
    countOne(
      "SELECT COUNT(*) AS n FROM messages WHERE tenant_id = $1 AND profile_id = $2",
      [DEFAULT_TENANT, profileId],
    ),
    countOne(
      "SELECT COUNT(*) AS n FROM journey_instances WHERE tenant_id = $1 AND profile_id = $2",
      [DEFAULT_TENANT, profileId],
    ),
  ]);

  const exposures = ((await readDocument<ExperimentExposure[]>(DOCUMENT_KEYS.exposures)) ?? [])
    .filter((exposure) => exposure.profileId === profileId).length;

  const participations = (
    (await readDocument<JourneyParticipation[]>(DOCUMENT_KEYS.participations)) ?? []
  ).filter((participation) => participation.profileId === profileId).length;

  const firedTriggerKeys = (
    (await readDocument<string[]>(DOCUMENT_KEYS.firedTriggers)) ?? []
  ).filter((key) => key.split(":")[1] === profileId).length;

  return {
    ...EMPTY_COUNTS,
    profile,
    events,
    messages,
    instances,
    exposures,
    participations,
    firedTriggerKeys,
  };
}

/**
 * A one-way hash of the email, kept after erasure.
 *
 * This is the "minimum necessary to honour the request" that erasure permits.
 * Without it you would delete the record of someone asking never to be
 * contacted, and the next time they appeared on an import you would start
 * messaging them again — which is the opposite of what they asked for.
 *
 * Salted, because the space of email addresses is small enough to brute-force
 * an unsalted hash. Changing `PRIVACY_SALT` breaks matching against existing
 * entries, so it should be set once and left alone.
 */
export function suppressionHash(email: string): string {
  const salt = process.env.PRIVACY_SALT?.trim() ?? "cadence-suppression-v1";
  return createHash("sha256").update(`${salt}:${email.trim().toLowerCase()}`).digest("hex");
}

export interface SuppressionEntry {
  emailHash: string;
  erasedAt: string;
  /** Counts only — never the data itself. */
  removed: ErasureCounts;
}

/**
 * Deletes every trace of a person, then records that it happened.
 *
 * The row deletions run in one transaction so a partial erasure cannot be left
 * behind. The document rewrites follow: they are separate writes by nature, and
 * the preview-then-verify flow is what catches a failure mid-way.
 */
export async function executeErasure(
  profileId: string,
  email: string,
): Promise<ErasureReceipt> {
  const removed = await planErasure(profileId);
  const handle = await db();

  await handle.transaction(async (tx) => {
    await tx.query(
      "DELETE FROM journey_instances WHERE tenant_id = $1 AND profile_id = $2",
      [DEFAULT_TENANT, profileId],
    );
    await tx.query("DELETE FROM messages WHERE tenant_id = $1 AND profile_id = $2", [
      DEFAULT_TENANT,
      profileId,
    ]);
    await tx.query("DELETE FROM events WHERE tenant_id = $1 AND profile_id = $2", [
      DEFAULT_TENANT,
      profileId,
    ]);
    await tx.query("DELETE FROM profiles WHERE tenant_id = $1 AND id = $2", [
      DEFAULT_TENANT,
      profileId,
    ]);
  });

  // Documents: rewrite each without this person.
  const exposures = (await readDocument<ExperimentExposure[]>(DOCUMENT_KEYS.exposures)) ?? [];
  await writeDocument(
    DOCUMENT_KEYS.exposures,
    exposures.filter((exposure) => exposure.profileId !== profileId),
  );

  const participations =
    (await readDocument<JourneyParticipation[]>(DOCUMENT_KEYS.participations)) ?? [];
  await writeDocument(
    DOCUMENT_KEYS.participations,
    participations.filter((participation) => participation.profileId !== profileId),
  );

  // The identifier is inside the key here, not a field.
  const fired = (await readDocument<string[]>(DOCUMENT_KEYS.firedTriggers)) ?? [];
  await writeDocument(
    DOCUMENT_KEYS.firedTriggers,
    fired.filter((key) => key.split(":")[1] !== profileId),
  );

  // Retained deliberately, and holds no personal data beyond a salted hash.
  const suppression = (await readDocument<SuppressionEntry[]>(DOCUMENT_KEYS.suppression)) ?? [];
  await writeDocument(DOCUMENT_KEYS.suppression, [
    ...suppression,
    { emailHash: suppressionHash(email), erasedAt: new Date().toISOString(), removed },
  ]);

  return {
    kind: "erasure",
    at: new Date().toISOString(),
    removed,
    suppressionRetained: true,
  };
}

/** Whether this email was previously erased, so it is not silently re-added. */
export async function isSuppressed(email: string): Promise<boolean> {
  const suppression = (await readDocument<SuppressionEntry[]>(DOCUMENT_KEYS.suppression)) ?? [];
  const hash = suppressionHash(email);
  return suppression.some((entry) => entry.emailHash === hash);
}

/**
 * Confirms nothing was left behind.
 *
 * Run after an erasure. If this returns anything other than all zeros, the
 * sweep has a gap — which is exactly the failure that must never go unnoticed,
 * because by then the person has been told their data is gone.
 */
export async function verifyErasure(profileId: string): Promise<ErasureCounts> {
  return planErasure(profileId);
}

/* -------------------------------------------------------------------------- */
/* Request log                                                                */
/* -------------------------------------------------------------------------- */

export async function listRequests(): Promise<DataSubjectRequest[]> {
  const requests =
    (await readDocument<DataSubjectRequest[]>(DOCUMENT_KEYS.privacyRequests)) ?? [];
  return [...requests].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );
}

export async function saveRequest(request: DataSubjectRequest): Promise<void> {
  const requests =
    (await readDocument<DataSubjectRequest[]>(DOCUMENT_KEYS.privacyRequests)) ?? [];
  const index = requests.findIndex((item) => item.id === request.id);
  const next = [...requests];
  if (index >= 0) next[index] = request;
  else next.push(request);
  await writeDocument(DOCUMENT_KEYS.privacyRequests, next);
}

export async function getRequest(id: string): Promise<DataSubjectRequest | null> {
  return (await listRequests()).find((request) => request.id === id) ?? null;
}

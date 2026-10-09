/**
 * Data subject requests — access, erasure, and the rest of the UK GDPR rights.
 *
 * Two things make this harder than "delete the row", and both are the reason
 * this is its own module rather than a button somewhere:
 *
 *  1. **Personal data is spread across seven stores**, and one of them hides an
 *     identifier inside a string key. An erasure that misses a store is worse
 *     than no erasure at all, because you have told someone their data is gone
 *     when it is not.
 *
 *  2. **Erasure is not unconditional.** You may keep the minimum needed to
 *     honour the request itself — otherwise deleting someone who asked never to
 *     be contacted would lose the very record that stops you contacting them
 *     again.
 */

import { applyOffset } from "./scheduled-trigger";

export type RequestKind =
  | "access"
  | "erasure"
  | "rectification"
  | "portability"
  | "objection";

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  access: "Access — give them a copy",
  erasure: "Erasure — delete their data",
  rectification: "Rectification — correct something",
  portability: "Portability — machine-readable export",
  objection: "Objection — stop marketing to them",
};

/** What each right actually obliges you to do, in plain terms. */
export const REQUEST_KIND_OBLIGATION: Record<RequestKind, string> = {
  access:
    "Provide everything you hold about them, in an intelligible form, free of charge.",
  erasure:
    "Delete their personal data, unless you have a legal reason to keep some of it (tax records, for instance).",
  rectification: "Correct anything inaccurate, and tell them you have.",
  portability:
    "Provide the data they gave you in a structured, commonly used, machine-readable format.",
  objection:
    "Stop processing for marketing immediately. This one has no grace period.",
};

export type RequestStatus =
  | "received"
  | "verifying"
  | "in_progress"
  | "completed"
  | "refused";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  received: "Received",
  verifying: "Verifying identity",
  in_progress: "In progress",
  completed: "Completed",
  refused: "Refused",
};

export const REQUEST_STATUS_TONE: Record<
  RequestStatus,
  "neutral" | "warning" | "accent" | "positive" | "negative"
> = {
  received: "warning",
  verifying: "warning",
  in_progress: "accent",
  completed: "positive",
  refused: "neutral",
};

export interface DataSubjectRequest {
  id: string;
  kind: RequestKind;
  /** Needed to respond to them, and to match them to a client record. */
  subjectEmail: string;
  subjectName?: string;
  /** The matched client, once found. Null if nothing matches. */
  profileId: string | null;
  status: RequestStatus;
  receivedAt: string;
  /** One calendar month from receipt. */
  dueBy: string;
  /**
   * Whether you have confirmed they are who they say.
   *
   * Required before erasure runs. Without it, anyone could delete anyone
   * else's record by knowing their email address.
   */
  identityVerified: boolean;
  verifiedNote?: string;
  completedAt: string | null;
  notes?: string;
  /** What was actually done. Deliberately holds no personal data. */
  receipt?: ErasureReceipt | ExportReceipt;
}

export interface ErasureReceipt {
  kind: "erasure";
  at: string;
  removed: ErasureCounts;
  /** Kept deliberately — see `suppressionRetained`. */
  suppressionRetained: boolean;
}

export interface ExportReceipt {
  kind: "export";
  at: string;
  records: number;
}

/**
 * What an erasure will remove, per store.
 *
 * Shown before anything is deleted. A preview matters because erasure cannot
 * be undone, and because seeing "0 events" when you expected 20 is how you
 * catch a bug before a customer does.
 */
export interface ErasureCounts {
  profile: number;
  events: number;
  messages: number;
  instances: number;
  exposures: number;
  participations: number;
  firedTriggerKeys: number;
}

export function totalRecords(counts: ErasureCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export const EMPTY_COUNTS: ErasureCounts = {
  profile: 0,
  events: 0,
  messages: 0,
  instances: 0,
  exposures: 0,
  participations: 0,
  firedTriggerKeys: 0,
};

export const STORE_LABELS: Record<keyof ErasureCounts, string> = {
  profile: "Client record",
  events: "Events",
  messages: "Messages sent",
  instances: "Journey progress",
  exposures: "Experiment ledger",
  participations: "Journey history",
  firedTriggerKeys: "Reminder history",
};

/* -------------------------------------------------------------------------- */
/* Deadlines                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One calendar month from receipt, which is what the regulation says — not 30
 * days. The existing calendar-aware offset handles short months.
 */
export function dueDateFor(receivedAt: string): string {
  return applyOffset(new Date(receivedAt), 1, "months").toISOString();
}

export function daysRemaining(request: DataSubjectRequest, now = new Date()): number {
  return Math.ceil((new Date(request.dueBy).getTime() - now.getTime()) / 86_400_000);
}

export function isOverdue(request: DataSubjectRequest, now = new Date()): boolean {
  if (request.status === "completed" || request.status === "refused") return false;
  return new Date(request.dueBy).getTime() < now.getTime();
}

export function isOpen(request: DataSubjectRequest): boolean {
  return request.status !== "completed" && request.status !== "refused";
}

export function describeDeadline(request: DataSubjectRequest, now = new Date()): string {
  if (request.status === "completed") return "Completed";
  if (request.status === "refused") return "Refused";
  const days = daysRemaining(request, now);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

export function createRequest(
  kind: RequestKind,
  subjectEmail: string,
  receivedAt = new Date().toISOString(),
): DataSubjectRequest {
  return {
    id: `dsr_${Math.random().toString(36).slice(2, 10)}`,
    kind,
    subjectEmail: subjectEmail.trim().toLowerCase(),
    profileId: null,
    status: "received",
    receivedAt,
    dueBy: dueDateFor(receivedAt),
    identityVerified: false,
    completedAt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Export shape                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything held about one person.
 *
 * Returned for both access and portability requests: the same data satisfies
 * both, the difference being only that portability must be machine-readable,
 * which JSON is.
 */
export interface PersonalDataExport {
  generatedAt: string;
  subject: { profileId: string; email: string; name: string };
  explanation: string;
  client: unknown;
  events: unknown[];
  messages: unknown[];
  journeyProgress: unknown[];
  experimentParticipation: unknown[];
  journeyHistory: unknown[];
  remindersSent: string[];
}

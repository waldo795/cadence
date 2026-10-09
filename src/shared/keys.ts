/**
 * Document keys shared by the server store and the client cache.
 *
 * Kept in `shared/` because both sides import them and neither should own them
 * — a mismatch here would silently produce an empty collection rather than an
 * error.
 */
export const DOCUMENT_KEYS = {
  journeys: "journeys",
  eventTemplates: "eventTemplates",
  participations: "participations",
  contactPolicy: "contactPolicy",
  experiments: "experiments",
  scheduledTriggers: "scheduledTriggers",
  firedTriggers: "firedTriggers",
  exposures: "exposures",
  experimentBaselines: "experimentBaselines",
  privacyRequests: "privacyRequests",
  suppression: "suppression",
  emailTheme: "emailTheme",
  sendSettings: "sendSettings",
  testRecipients: "testRecipients",
  sendingControls: "sendingControls",
  seededAt: "seededAt",
} as const;

export type DocumentKey = (typeof DOCUMENT_KEYS)[keyof typeof DOCUMENT_KEYS];

/** The payload `GET /api/snapshot` returns and the client hydrates from. */
export interface Snapshot {
  profiles: unknown[];
  events: unknown[];
  messages: unknown[];
  documents: Record<string, unknown>;
}

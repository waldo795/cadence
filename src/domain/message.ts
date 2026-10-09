import type { Channel } from "./journey";

export type MessageStatus =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "suppressed"
  | "withheld"
  | "simulated"
  /** Accepted by the email provider for the real client. */
  | "sent"
  /** Accepted by the provider, but redirected to a test address. */
  | "test"
  /** Decided, but not handed to a provider: kill switch, or journey not sending. */
  | "blocked"
  /** Handed to the provider and rejected. */
  | "failed";

export interface MessageRecord {
  id: string;
  profileId: string;
  channel: Channel;
  template: string;
  /** Stable identity of the creative, used by cross-journey exclusion rules. */
  messageKey: string;
  subject: string;
  body: string;
  status: MessageStatus;
  sentAt: string;
  journeyId: string;
  /** Lineage key of the sending journey — version-independent by design. */
  journeyKey: string;
  journeyName: string;
  /** Where it actually went. Differs from the client's address in test mode. */
  sentTo?: string;
  /** The provider's own id, for chasing a delivery up with them. */
  providerId?: string;
  /** Why it was blocked or redirected — the plain-language audit trail. */
  sendDetail?: string;
}

export const MESSAGE_STATUS_TONE: Record<MessageStatus, "positive" | "neutral" | "negative"> = {
  delivered: "positive",
  opened: "positive",
  clicked: "positive",
  bounced: "negative",
  suppressed: "negative",
  withheld: "neutral",
  simulated: "neutral",
  sent: "positive",
  test: "neutral",
  blocked: "neutral",
  failed: "negative",
};

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  suppressed: "Suppressed",
  withheld: "Withheld",
  simulated: "Simulated",
  sent: "Sent",
  test: "Test send",
  blocked: "Not sent",
  failed: "Failed",
};

/**
 * Only messages that actually reached the client count toward caps and
 * exclusions.
 *
 * `test` is excluded deliberately. A redirected message never arrived with the
 * client, so counting it would let a few test runs eat a real bride's weekly
 * allowance and silently suppress the reminder she was supposed to get.
 */
export const REACHED_STATUSES: MessageStatus[] = [
  "delivered",
  "opened",
  "clicked",
  "simulated",
  "sent",
];

export function didReachProfile(record: MessageRecord): boolean {
  return REACHED_STATUSES.includes(record.status);
}

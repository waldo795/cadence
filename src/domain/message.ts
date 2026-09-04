import type { Channel } from "./journey";

export type MessageStatus =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "suppressed"
  | "withheld"
  | "simulated";

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
}

export const MESSAGE_STATUS_TONE: Record<MessageStatus, "positive" | "neutral" | "negative"> = {
  delivered: "positive",
  opened: "positive",
  clicked: "positive",
  bounced: "negative",
  suppressed: "negative",
  withheld: "neutral",
  simulated: "neutral",
};

/** Only messages that actually reached someone count toward caps and exclusions. */
export const REACHED_STATUSES: MessageStatus[] = ["delivered", "opened", "clicked", "simulated"];

export function didReachProfile(record: MessageRecord): boolean {
  return REACHED_STATUSES.includes(record.status);
}

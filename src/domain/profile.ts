import type { Channel } from "./journey";

export type LoyaltyTier = "Bronze" | "Silver" | "Gold" | "Platinum";

export type ConsentState = "subscribed" | "unsubscribed" | "unknown";

export interface Contactability {
  email: ConsentState;
  push: ConsentState;
  sms: ConsentState;
  /** Global suppression overrides every channel consent. */
  globallySuppressed: boolean;
  /** Push cannot be delivered without a device token, even with consent. */
  hasPushToken: boolean;
}

/**
 * Attributes are intentionally a loose record so the PoC can demo arbitrary
 * customer schemas. `ProfileAttributeValue` keeps it typed without reaching
 * for `any`.
 */
export type ProfileAttributeValue = string | number | boolean | null;

export type EngagementTier = "high" | "medium" | "low";

/**
 * Engagement banding drives contact governance, so the thresholds live here
 * rather than being re-derived by each rule.
 */
export function engagementTierFor(score: number): EngagementTier {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function tenureDays(profile: Profile, now: Date = new Date()): number {
  const created = new Date(profile.createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / 86_400_000));
}

export interface Profile {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  country: string;
  loyaltyTier: LoyaltyTier;
  appInstalled: boolean;
  lifetimeValue: number;
  preferredLanguage: string;
  preferredClub: string;
  /**
   * Free-form labels applied by scheduled triggers and used as segments.
   * A tag records *who someone is*; the event a trigger emits records *when
   * something happened* — the two answer different questions.
   */
  tags: string[];
  createdAt: string;
  /** 0–100 composite of opens, clicks and app activity. Drives contact governance. */
  engagementScore: number;
  /** Marketing messages already sent inside the current frequency window. */
  messagesInLast24h: number;
  /** Marketing messages sent in the trailing 7 days, used by weekly caps. */
  messagesInLast7d: number;
  contactability: Contactability;
  attributes: Record<string, ProfileAttributeValue>;
  /** Short human summary shown in the explorer to explain why this profile is interesting. */
  segmentNote: string;
}

export function fullName(profile: Profile): string {
  return `${profile.firstName} ${profile.lastName}`;
}

export function initials(profile: Profile): string {
  return `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase();
}

export function consentFor(profile: Profile, channel: Channel): ConsentState {
  return profile.contactability[channel];
}

/**
 * Flattens a profile into the dot-path namespace used by conditions and
 * message templates (`profile.firstName`, `profile.loyaltyTier`, …).
 */
export function profileContext(
  profile: Profile,
  now: Date = new Date(),
): Record<string, ProfileAttributeValue> {
  return {
    id: profile.id,
    customerId: profile.customerId,
    tenureDays: tenureDays(profile, now),
    engagementScore: profile.engagementScore,
    engagementTier: engagementTierFor(profile.engagementScore),
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: fullName(profile),
    email: profile.email,
    mobile: profile.mobile,
    country: profile.country,
    loyaltyTier: profile.loyaltyTier,
    appInstalled: profile.appInstalled,
    lifetimeValue: profile.lifetimeValue,
    preferredLanguage: profile.preferredLanguage,
    preferredClub: profile.preferredClub,
    // Joined so `profile.tags contains bride` works with the existing operators.
    tags: (profile.tags ?? []).join(","),
    emailConsent: profile.contactability.email,
    pushConsent: profile.contactability.push,
    smsConsent: profile.contactability.sms,
    hasPushToken: profile.contactability.hasPushToken,
    globallySuppressed: profile.contactability.globallySuppressed,
    ...profile.attributes,
  };
}

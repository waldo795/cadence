import type { CustomerEvent } from "@/domain/event";
import type { Profile } from "@/domain/profile";
import { findProfileByEmail, insertEvents, upsertProfile } from "./store";

/**
 * Client intake from the public website form.
 *
 * Everything arriving here is untrusted: it comes from a form anyone on the
 * internet can post to. So the input is validated and length-capped rather than
 * trusted, and the result is a normal `Profile` plus a normal event — nothing
 * downstream needs to know the difference between a client captured here and
 * one typed in by hand.
 */

export interface IntakeInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  mobile?: unknown;
  weddingDate?: unknown;
  venue?: unknown;
  serviceBooked?: unknown;
  partySize?: unknown;
  notes?: unknown;
  emailConsent?: unknown;
  smsConsent?: unknown;
  /** Hidden field. Humans leave it empty; bots fill it in. */
  website?: unknown;
}

export interface IntakeResult {
  ok: true;
  profileId: string;
  created: boolean;
}

export interface IntakeFailure {
  ok: false;
  errors: string[];
}

const MAX_TEXT = 500;
const MAX_NOTES = 2000;

function text(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Checkboxes only appear in a form body when ticked, and arrive as "on" or the
 * value attribute. Anything else is treated as *not* consented — the default
 * has to fail closed.
 */
function checkbox(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "on" || normalised === "true" || normalised === "yes" || normalised === "1";
}

/** Deliberately loose — the goal is catching typos, not policing addresses. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/**
 * Accepts a date only if it is plausible for a wedding.
 *
 * A far-future or long-past date is almost always a typo or a bot, and letting
 * one in would put a client on a countdown that never fires or fires wrongly.
 */
function weddingDate(value: unknown): { iso: string | null; error?: string } {
  const raw = text(value, 40);
  if (!raw) return { iso: null };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { iso: null, error: "Wedding date is not a valid date." };

  const now = Date.now();
  const fiveYears = 5 * 365 * 86_400_000;
  const twoYearsPast = 2 * 365 * 86_400_000;

  if (parsed.getTime() > now + fiveYears) {
    return { iso: null, error: "Wedding date is more than five years away." };
  }
  if (parsed.getTime() < now - twoYearsPast) {
    return { iso: null, error: "Wedding date is more than two years in the past." };
  }
  return { iso: parsed.toISOString() };
}

export function validateIntake(input: IntakeInput): IntakeFailure | { ok: true; clean: CleanIntake } {
  const errors: string[] = [];

  const firstName = text(input.firstName, 80);
  const email = text(input.email, 254).toLowerCase();

  if (!firstName) errors.push("First name is required.");
  if (!email) errors.push("Email is required.");
  else if (!looksLikeEmail(email)) errors.push("Email does not look like an email address.");

  const wedding = weddingDate(input.weddingDate);
  if (wedding.error) errors.push(wedding.error);

  if (errors.length > 0) return { ok: false, errors };

  const partySizeRaw = Number(text(input.partySize, 10));
  const partySize = Number.isFinite(partySizeRaw)
    ? Math.min(50, Math.max(0, Math.round(partySizeRaw)))
    : 0;

  return {
    ok: true,
    clean: {
      firstName,
      lastName: text(input.lastName, 80),
      email,
      mobile: text(input.mobile, 40),
      weddingDate: wedding.iso,
      venue: text(input.venue, 200),
      serviceBooked: text(input.serviceBooked, 200),
      partySize,
      notes: text(input.notes, MAX_NOTES),
      emailConsent: checkbox(input.emailConsent),
      smsConsent: checkbox(input.smsConsent),
    },
  };
}

export interface CleanIntake {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  weddingDate: string | null;
  venue: string;
  serviceBooked: string;
  partySize: number;
  notes: string;
  emailConsent: boolean;
  smsConsent: boolean;
}

/** Bots fill hidden fields; humans do not. */
export function isSpam(input: IntakeInput): boolean {
  return text(input.website, 200) !== "";
}

/**
 * Creates or updates the client, then emits the enquiry event.
 *
 * Matching on email means a bride who enquires twice does not become two
 * clients — which would otherwise put her on the countdown twice and send
 * every reminder in duplicate.
 *
 * A repeat submission *does* overwrite consent with whatever was ticked this
 * time, including withdrawing it. The form is the client's current stated
 * preference, and quietly keeping an older, more permissive answer is exactly
 * the behaviour that gets a business in trouble.
 */
export async function recordIntake(clean: CleanIntake, now = new Date()): Promise<IntakeResult> {
  const existing = await findProfileByEmail(clean.email);
  const created = existing === null;

  const id =
    existing?.id ??
    `prof_${clean.firstName.toLowerCase().replace(/[^a-z]/g, "") || "client"}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  const profile: Profile = {
    id,
    customerId: existing?.customerId ?? `cli_${Math.floor(1000 + Math.random() * 9000)}`,
    firstName: clean.firstName,
    lastName: clean.lastName || (existing?.lastName ?? ""),
    email: clean.email,
    mobile: clean.mobile || (existing?.mobile ?? ""),
    country: existing?.country ?? "United Kingdom",
    loyaltyTier: existing?.loyaltyTier ?? "Bronze",
    appInstalled: false,
    lifetimeValue: existing?.lifetimeValue ?? 0,
    preferredLanguage: existing?.preferredLanguage ?? "English",
    preferredClub: existing?.preferredClub ?? "—",
    tags: [...new Set([...(existing?.tags ?? []), "enquiry", "website"])],
    createdAt: existing?.createdAt ?? now.toISOString(),
    engagementScore: existing?.engagementScore ?? 50,
    messagesInLast24h: existing?.messagesInLast24h ?? 0,
    messagesInLast7d: existing?.messagesInLast7d ?? 0,
    contactability: {
      email: clean.emailConsent ? "subscribed" : "unsubscribed",
      push: "unknown",
      sms: clean.smsConsent ? "subscribed" : "unsubscribed",
      // Never cleared by a form post. Suppression is a decision made in the
      // app, and a public endpoint must not be able to undo it.
      globallySuppressed: existing?.contactability.globallySuppressed ?? false,
      hasPushToken: false,
    },
    attributes: {
      ...(existing?.attributes ?? {}),
      // An enquiry never promotes someone to a confirmed booking. That happens
      // when the deposit is taken, which this endpoint cannot know about.
      bookingStatus: existing?.attributes?.bookingStatus === "confirmed" ? "confirmed" : "enquiry",
      weddingDate: clean.weddingDate ?? existing?.attributes?.weddingDate ?? null,
      venue: clean.venue || (existing?.attributes?.venue as string) || "—",
      serviceBooked: clean.serviceBooked || (existing?.attributes?.serviceBooked as string) || "—",
      partySize: clean.partySize || (existing?.attributes?.partySize as number) || 0,
      trialCompleted: existing?.attributes?.trialCompleted ?? false,
      readyByTime: existing?.attributes?.readyByTime ?? "",
      depositPaid: existing?.attributes?.depositPaid ?? false,
      referredBy: existing?.attributes?.referredBy ?? "Website form",
      notes: clean.notes || (existing?.attributes?.notes as string) || "",
    },
    segmentNote: existing?.segmentNote ?? "Captured from the website enquiry form.",
  };

  await upsertProfile(profile);

  const event: CustomerEvent = {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    name: "enquiry.submitted",
    profileId: id,
    occurredAt: now.toISOString(),
    payload: {
      source: "website-form",
      weddingDate: clean.weddingDate,
      venue: clean.venue || null,
      serviceBooked: clean.serviceBooked || null,
      partySize: clean.partySize,
      emailConsent: clean.emailConsent,
      smsConsent: clean.smsConsent,
      repeatEnquiry: !created,
    },
  };

  await insertEvents([event]);

  return { ok: true, profileId: id, created };
}

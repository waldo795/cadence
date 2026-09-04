/**
 * Scheduled triggers — date-relative conditions that emit events.
 *
 * The important design choice here is that a trigger does **not** run a
 * journey. It watches a date on the profile ("wedding date minus 3 months"),
 * and when that moment arrives it emits a normal event with a configurable
 * payload. Journeys then listen for that event exactly as they listen for any
 * other.
 *
 * That indirection is what makes the system flexible. The journey has no idea
 * dates are involved, so the same countdown event can start several journeys,
 * be replayed, be triggered manually for a test, or arrive from a real booking
 * system later — none of which would be possible if the date logic lived inside
 * the journey.
 *
 * A trigger may also tag the profile, so "is in the 3-month window" is
 * queryable as a segment *and* observable as an event. Segment membership tells
 * you who someone is; the event tells you when something happened. Most
 * marketing tools force you to pick one.
 */

import { evaluateCondition, interpolate, type EvaluationContext } from "./expression";
import type { ConditionOperator } from "./journey";
import { profileContext, type Profile } from "./profile";
import type { CustomerEvent, JsonValue } from "./event";

export type OffsetUnit = "days" | "weeks" | "months";

export const OFFSET_UNIT_LABEL: Record<OffsetUnit, string> = {
  days: "days",
  weeks: "weeks",
  months: "months",
};

export interface TriggerCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface PayloadField {
  id: string;
  key: string;
  /** May contain `{{profile.*}}` and `{{trigger.*}}` placeholders. */
  value: string;
}

export interface ScheduledTrigger {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** Profile path holding the anchor date, e.g. `profile.weddingDate`. */
  anchorField: string;
  /** Negative fires before the anchor, positive after. */
  offsetValue: number;
  offsetUnit: OffsetUnit;
  /** Every condition must pass before the trigger is eligible. */
  conditions: TriggerCondition[];
  /** Applied to the profile when the trigger fires. Optional. */
  addTag?: string;
  /**
   * How far in the past a fire time may be and still fire.
   *
   * Without this, importing a client whose wedding was last year would send
   * them "three months to go!" today. A short window lets a scheduler that was
   * down for a few hours catch up, while refusing to send messages about
   * milestones that are long past.
   */
  catchUpDays: number;
  /** The event emitted. This is what journeys actually listen for. */
  eventName: string;
  payload: PayloadField[];
  createdAt: string;
}

/** Sensible default: tolerate an outage, refuse to rewrite history. */
export const DEFAULT_CATCH_UP_DAYS = 2;

/* -------------------------------------------------------------------------- */
/* Date maths                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Adds a calendar offset, clamping the day when the target month is shorter.
 *
 * "31 March minus one month" has no correct answer; clamping to 28/29 February
 * is the convention every calendar app uses, and it matters here because a
 * bride booked for the 31st should still get her reminder.
 */
export function applyOffset(date: Date, value: number, unit: OffsetUnit): Date {
  const result = new Date(date.getTime());

  if (unit === "days") {
    result.setDate(result.getDate() + value);
    return result;
  }
  if (unit === "weeks") {
    result.setDate(result.getDate() + value * 7);
    return result;
  }

  const targetDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + value);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return result;
}

export function describeOffset(value: number, unit: OffsetUnit): string {
  const magnitude = Math.abs(value);
  const noun = magnitude === 1 ? unit.replace(/s$/, "") : unit;
  if (value === 0) return "on the day";
  return value < 0 ? `${magnitude} ${noun} before` : `${magnitude} ${noun} after`;
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

export type TriggerStatus =
  | "due"
  | "scheduled"
  | "already_fired"
  | "missed"
  | "ineligible"
  | "no_anchor"
  | "disabled";

export interface TriggerEvaluation {
  triggerId: string;
  triggerName: string;
  profileId: string;
  anchorDate: Date | null;
  fireAt: Date | null;
  status: TriggerStatus;
  explanation: string;
}

/**
 * The key a fired trigger is recorded under.
 *
 * It includes the anchor date on purpose. If a bride moves her wedding, the
 * key changes and the countdown legitimately fires again for the new date —
 * which is the behaviour you want, and which a naive
 * "fired once per profile" flag would get wrong.
 */
export function firedKey(
  triggerId: string,
  profileId: string,
  anchorDate: Date,
): string {
  return `${triggerId}:${profileId}:${anchorDate.toISOString().slice(0, 10)}`;
}

function readAnchor(
  trigger: ScheduledTrigger,
  context: EvaluationContext,
): Date | null {
  const segments = trigger.anchorField.split(".").filter(Boolean);
  let current: unknown = context as unknown;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== "string" && typeof current !== "number") return null;
  const parsed = new Date(current);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluateTrigger(
  trigger: ScheduledTrigger,
  profile: Profile,
  now: Date,
  firedKeys: ReadonlySet<string>,
): TriggerEvaluation {
  const base = {
    triggerId: trigger.id,
    triggerName: trigger.name,
    profileId: profile.id,
  };

  if (!trigger.enabled) {
    return {
      ...base,
      anchorDate: null,
      fireAt: null,
      status: "disabled",
      explanation: "This trigger is switched off.",
    };
  }

  const context: EvaluationContext = {
    profile: profileContext(profile, now),
    event: {},
    journey: {},
  };

  const anchorDate = readAnchor(trigger, context);
  if (!anchorDate) {
    return {
      ...base,
      anchorDate: null,
      fireAt: null,
      status: "no_anchor",
      explanation: `${profile.firstName} has no value for ${trigger.anchorField}, so there is nothing to count from.`,
    };
  }

  const failing = trigger.conditions.filter(
    (condition) =>
      !evaluateCondition(context, condition.field, condition.operator, condition.value)
        .passed,
  );
  if (failing.length > 0) {
    const first = failing[0];
    const result = evaluateCondition(context, first.field, first.operator, first.value);
    return {
      ...base,
      anchorDate,
      fireAt: null,
      status: "ineligible",
      explanation: `Does not qualify: ${result.explanation}.`,
    };
  }

  const fireAt = applyOffset(anchorDate, trigger.offsetValue, trigger.offsetUnit);

  if (firedKeys.has(firedKey(trigger.id, profile.id, anchorDate))) {
    return {
      ...base,
      anchorDate,
      fireAt,
      status: "already_fired",
      explanation: "Already fired for this anchor date. It would fire again if the date moved.",
    };
  }

  if (fireAt.getTime() > now.getTime()) {
    const days = Math.ceil((fireAt.getTime() - now.getTime()) / 86_400_000);
    return {
      ...base,
      anchorDate,
      fireAt,
      status: "scheduled",
      explanation: `Fires in ${days} day${days === 1 ? "" : "s"}.`,
    };
  }

  const catchUp = trigger.catchUpDays ?? DEFAULT_CATCH_UP_DAYS;
  const daysLate = Math.floor((now.getTime() - fireAt.getTime()) / 86_400_000);
  if (daysLate > catchUp) {
    return {
      ...base,
      anchorDate,
      fireAt,
      status: "missed",
      explanation: `Missed — this was due ${daysLate} days ago, beyond the ${catchUp}-day catch-up window. Sending it now would reference a milestone that has passed.`,
    };
  }

  return {
    ...base,
    anchorDate,
    fireAt,
    status: "due",
    explanation: `Due — ${describeOffset(trigger.offsetValue, trigger.offsetUnit)} the anchor date${daysLate > 0 ? `, ${daysLate} day${daysLate === 1 ? "" : "s"} ago and inside the catch-up window` : ""}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Emission                                                                   */
/* -------------------------------------------------------------------------- */

function coerce(raw: string): JsonValue {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

/**
 * Builds the event a due trigger emits.
 *
 * Payload values are interpolated against the profile and the trigger's own
 * dates, so a countdown event can carry the wedding date and days remaining
 * without the journey having to recompute them.
 */
export function buildTriggerEvent(
  trigger: ScheduledTrigger,
  profile: Profile,
  evaluation: TriggerEvaluation,
  now: Date,
): CustomerEvent {
  const anchor = evaluation.anchorDate;
  const daysUntilAnchor = anchor
    ? Math.round((anchor.getTime() - now.getTime()) / 86_400_000)
    : 0;

  const context: EvaluationContext = {
    profile: profileContext(profile, now),
    event: {},
    journey: {},
    // Exposed under `trigger.*` so a payload can carry the dates that caused
    // the event, sparing every downstream journey from recomputing them.
    trigger: {
      name: trigger.name,
      anchorDate: anchor ? anchor.toISOString() : null,
      anchorDateShort: anchor ? anchor.toISOString().slice(0, 10) : null,
      firedAt: now.toISOString(),
      daysUntilAnchor,
      offset: describeOffset(trigger.offsetValue, trigger.offsetUnit),
    },
  };

  const payload: Record<string, JsonValue> = {};
  for (const field of trigger.payload) {
    if (!field.key) continue;
    payload[field.key] = coerce(interpolate(field.value, context));
  }

  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    name: trigger.eventName,
    profileId: profile.id,
    occurredAt: now.toISOString(),
    payload,
  };
}

export function createScheduledTrigger(): ScheduledTrigger {
  return {
    id: `trg_${Math.random().toString(36).slice(2, 9)}`,
    name: "New reminder",
    description: "",
    enabled: false,
    anchorField: "profile.weddingDate",
    offsetValue: -1,
    offsetUnit: "months",
    conditions: [],
    catchUpDays: DEFAULT_CATCH_UP_DAYS,
    eventName: "wedding.countdown",
    payload: [
      { id: `p_${Math.random().toString(36).slice(2, 7)}`, key: "weddingDate", value: "{{trigger.anchorDateShort}}" },
      { id: `p_${Math.random().toString(36).slice(2, 7)}`, key: "daysUntil", value: "{{trigger.daysUntilAnchor}}" },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function createPayloadField(): PayloadField {
  return { id: `p_${Math.random().toString(36).slice(2, 7)}`, key: "", value: "" };
}

export function createTriggerCondition(): TriggerCondition {
  return {
    id: `c_${Math.random().toString(36).slice(2, 7)}`,
    field: "profile.bookingStatus",
    operator: "equals",
    value: "confirmed",
  };
}

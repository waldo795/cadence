import { resolvePath, type EvaluationContext } from "./expression";
import type { WaitUnit } from "./journey";

const MS: Record<WaitUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function addDuration(from: Date, duration: number, unit: WaitUnit): Date {
  return new Date(from.getTime() + duration * MS[unit]);
}

export function describeDuration(duration: number, unit: WaitUnit): string {
  const singular = unit.slice(0, -1);
  return `${duration} ${duration === 1 ? singular : unit}`;
}

export interface WaitUntilResolution {
  /** The resolved wake time, or `null` when the expression could not be resolved. */
  wakeAt: Date | null;
  /** What the parser understood, surfaced in the simulation trace. */
  explanation: string;
}

const EXPRESSION_PATTERN = /^\s*([\w.]+)\s*(?:([+-])\s*(\d+)\s*(minutes?|hours?|days?))?\s*$/i;

/**
 * Parses expressions of the form `event.fixture.startTime - 48 hours`.
 *
 * Kept deliberately narrow: enough to demonstrate relative scheduling without
 * inventing a date DSL that a real scheduler would replace anyway.
 */
export function resolveWaitUntil(
  expression: string,
  context: EvaluationContext,
  now: Date,
): WaitUntilResolution {
  const match = EXPRESSION_PATTERN.exec(expression);

  if (!match) {
    const parsed = new Date(expression);
    if (!Number.isNaN(parsed.getTime())) {
      return { wakeAt: parsed, explanation: `Absolute date ${expression}` };
    }
    return {
      wakeAt: null,
      explanation: `Could not parse "${expression}"`,
    };
  }

  const [, path, sign, amountRaw, unitRaw] = match;
  const base = resolvePath(context, path);

  let baseDate: Date | null = null;
  if (typeof base === "string" || typeof base === "number") {
    const parsed = new Date(base);
    if (!Number.isNaN(parsed.getTime())) baseDate = parsed;
  }

  if (!baseDate) {
    return {
      wakeAt: null,
      explanation: `${path} did not resolve to a date in the event context`,
    };
  }

  if (!sign) {
    return { wakeAt: baseDate, explanation: `${path} resolved to ${baseDate.toISOString()}` };
  }

  const unit = (unitRaw.toLowerCase().endsWith("s")
    ? unitRaw.toLowerCase()
    : `${unitRaw.toLowerCase()}s`) as WaitUnit;
  const offset = Number(amountRaw) * MS[unit] * (sign === "-" ? -1 : 1);
  const wakeAt = new Date(baseDate.getTime() + offset);

  // A wake time already in the past resolves immediately rather than stalling.
  const explanation =
    wakeAt.getTime() <= now.getTime()
      ? `${path} ${sign} ${amountRaw} ${unit} is already in the past — continuing immediately`
      : `${path} ${sign} ${amountRaw} ${unit}`;

  return { wakeAt, explanation };
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME_ONLY = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME.format(date);
}

export function formatTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return TIME_ONLY.format(date);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_ONLY.format(date);
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < day * 30) return rtf.format(Math.round(diff / day), "day");
  return DATE_ONLY.format(date);
}

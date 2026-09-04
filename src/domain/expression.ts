import {
  CONDITION_OPERATOR_SYMBOLS,
  UNARY_OPERATORS,
  type ConditionOperator,
} from "./journey";
import type { JsonValue } from "./event";

/**
 * The evaluation context every expression is resolved against. Namespaced so
 * `profile.firstName` and `event.fixture.homeTeam` can coexist, and so a real
 * engine could later add `journey.*` or `segment.*` without touching callers.
 */
export interface EvaluationContext {
  profile: Record<string, unknown>;
  event: Record<string, unknown>;
  journey: Record<string, unknown>;
  /** Present only while a scheduled trigger is building its event payload. */
  trigger?: Record<string, unknown>;
}

/** Walks a dot path such as `event.fixture.homeTeam` through the context. */
export function resolvePath(context: EvaluationContext, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return undefined;

  let current: unknown = context as unknown;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * A deliberately tiny interpolation pass supporting `{{profile.*}}`,
 * `{{event.*}}` and `{{journey.*}}`. This is not — and should not become — a
 * template language; a real implementation would delegate to the messaging
 * provider's own renderer.
 */
export function interpolate(template: string, context: EvaluationContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
    const value = resolvePath(context, path);
    if (value === undefined || value === null) return match;
    return formatValue(value);
  });
}

/** Reports which placeholders in a template could not be resolved. */
export function unresolvedPlaceholders(
  template: string,
  context: EvaluationContext,
): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const path = match[1];
    const value = resolvePath(context, path);
    if (value === undefined || value === null) found.add(path);
  }
  return [...found];
}

function coerceForComparison(raw: string): JsonValue {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

export interface ConditionResult {
  passed: boolean;
  /** Human-readable form of what was actually compared, e.g. `"Gold" == "Gold"`. */
  explanation: string;
  actualValue: unknown;
}

export function evaluateCondition(
  context: EvaluationContext,
  field: string,
  operator: ConditionOperator,
  value: string,
): ConditionResult {
  const actual = resolvePath(context, field);
  const expected = coerceForComparison(value);
  const actualLabel = actual === undefined ? "undefined" : JSON.stringify(actual);

  let passed = false;
  switch (operator) {
    case "equals":
      // Loose-ish equality: booleans and numbers arriving as strings still match.
      passed = actual === expected || formatValue(actual) === formatValue(expected);
      break;
    case "not_equals":
      passed = !(actual === expected || formatValue(actual) === formatValue(expected));
      break;
    case "contains":
      passed = formatValue(actual).toLowerCase().includes(formatValue(expected).toLowerCase());
      break;
    case "greater_than":
      passed = Number(actual) > Number(expected);
      break;
    case "less_than":
      passed = Number(actual) < Number(expected);
      break;
    case "exists":
      passed = actual !== undefined && actual !== null && actual !== "";
      break;
    case "not_exists":
      passed = actual === undefined || actual === null || actual === "";
      break;
  }

  const explanation = UNARY_OPERATORS.includes(operator)
    ? `${field} (${actualLabel}) ${CONDITION_OPERATOR_SYMBOLS[operator]}`
    : `${field} (${actualLabel}) ${CONDITION_OPERATOR_SYMBOLS[operator]} ${JSON.stringify(expected)}`;

  return { passed, explanation, actualValue: actual };
}

/** Canvas-facing summary, e.g. `profile.appInstalled == true`. */
export function describeCondition(
  field: string,
  operator: ConditionOperator,
  value: string,
): string {
  if (UNARY_OPERATORS.includes(operator)) {
    return `${field} ${CONDITION_OPERATOR_SYMBOLS[operator]}`;
  }
  return `${field} ${CONDITION_OPERATOR_SYMBOLS[operator]} ${value}`;
}

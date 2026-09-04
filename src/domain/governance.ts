/**
 * Air traffic control — contact governance that lives *outside* journeys.
 *
 * A journey should not be able to decide how often a customer may be contacted.
 * That belongs to the workspace, so a single change can protect every customer
 * across every journey at once.
 *
 * Resolution model: a global ceiling plus rules that can only ever *reduce* it.
 * When several rules match a profile the most restrictive wins, compared as a
 * normalised messages-per-day rate so that windows of different lengths ("3 per
 * 7 days" vs "1 per 1 day") are comparable. Caps therefore never creep upward
 * as rules accumulate, which is the property that keeps the system safe as it
 * grows.
 */

import { evaluateCondition, type EvaluationContext } from "./expression";
import type { Channel, ConditionOperator } from "./journey";
import { profileContext, type Profile } from "./profile";

export type RuleChannel = Channel | "all";

export interface RuleCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface FrequencyRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  channel: RuleChannel;
  /** Every condition must match for the rule to apply. */
  conditions: RuleCondition[];
  maxMessages: number;
  windowDays: number;
}

export interface ContactPolicy {
  /** The most any profile may ever receive. Rules reduce from here. */
  ceilingMaxMessages: number;
  ceilingWindowDays: number;
  rules: FrequencyRule[];
}

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  maxMessages: number;
  windowDays: number;
  perDay: number;
  /** Whether this rule ended up setting the effective cap. */
  applied: boolean;
  detail: string;
}

export interface CapEvaluation {
  maxMessages: number;
  windowDays: number;
  perDay: number;
  sourceId: string;
  sourceName: string;
  /** Every rule considered, in order, so the decision can be explained. */
  considered: RuleMatch[];
  summary: string;
}

export const CEILING_SOURCE_ID = "__ceiling__";

function ratePerDay(maxMessages: number, windowDays: number): number {
  return windowDays <= 0 ? Number.POSITIVE_INFINITY : maxMessages / windowDays;
}

export function describeCap(maxMessages: number, windowDays: number): string {
  const window = windowDays === 1 ? "day" : windowDays === 7 ? "week" : `${windowDays} days`;
  return `${maxMessages} per ${window}`;
}

/**
 * Resolves the cap that applies to one profile on one channel.
 *
 * Always returns a full trace of what was considered — an unexplained cap is
 * indistinguishable from a bug when a marketer asks why a send was blocked.
 */
export function resolveCap(
  policy: ContactPolicy,
  profile: Profile,
  channel: Channel,
): CapEvaluation {
  const context: EvaluationContext = {
    profile: profileContext(profile),
    event: {},
    journey: {},
  };

  let bestMax = policy.ceilingMaxMessages;
  let bestWindow = policy.ceilingWindowDays;
  let bestRate = ratePerDay(bestMax, bestWindow);
  let sourceId = CEILING_SOURCE_ID;
  let sourceName = "Workspace ceiling";

  const considered: RuleMatch[] = [];

  for (const rule of policy.rules) {
    const channelApplies = rule.channel === "all" || rule.channel === channel;
    const failing = rule.conditions.filter(
      (condition) =>
        !evaluateCondition(context, condition.field, condition.operator, condition.value).passed,
    );
    const matched = rule.enabled && channelApplies && failing.length === 0;
    const rate = ratePerDay(rule.maxMessages, rule.windowDays);

    let detail: string;
    if (!rule.enabled) detail = "Rule is disabled.";
    else if (!channelApplies) detail = `Applies to ${rule.channel}, not ${channel}.`;
    else if (failing.length > 0) {
      const first = failing[0];
      const result = evaluateCondition(context, first.field, first.operator, first.value);
      detail = `Did not match: ${result.explanation}.`;
    } else detail = `Matched — proposes ${describeCap(rule.maxMessages, rule.windowDays)}.`;

    /*
     * Lowest rate wins. Two tie-breaks, both about explaining the result:
     *  - a shorter window beats a longer one, because "1 per day" and "7 per
     *    week" are the same rate but not the same protection;
     *  - an explicit rule beats the implicit ceiling, so a rule that matches at
     *    the ceiling rate is still credited rather than looking like it did
     *    nothing.
     */
    const wins =
      matched &&
      (rate < bestRate ||
        (rate === bestRate &&
          (rule.windowDays < bestWindow || sourceId === CEILING_SOURCE_ID)));
    if (wins) {
      bestMax = rule.maxMessages;
      bestWindow = rule.windowDays;
      bestRate = rate;
      sourceId = rule.id;
      sourceName = rule.name;
    }

    considered.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      maxMessages: rule.maxMessages,
      windowDays: rule.windowDays,
      perDay: rate,
      applied: wins,
      detail,
    });
  }

  // Only the winning rule keeps `applied`; recompute after the full pass so a
  // rule beaten by a later, stricter one is not left flagged.
  for (const match of considered) match.applied = match.ruleId === sourceId;

  const summary =
    sourceId === CEILING_SOURCE_ID
      ? `No rule reduced the workspace ceiling of ${describeCap(bestMax, bestWindow)}.`
      : `"${sourceName}" is the most restrictive match at ${describeCap(bestMax, bestWindow)}.`;

  return {
    maxMessages: bestMax,
    windowDays: bestWindow,
    perDay: bestRate,
    sourceId,
    sourceName,
    considered,
    summary,
  };
}

/**
 * How many messages the profile has already had inside a window of this length.
 * The PoC keeps trailing counters on the profile rather than replaying the full
 * message log, which is what a real counter store (Redis) would do.
 */
export function messagesInWindow(
  profile: Pick<Profile, "messagesInLast24h" | "messagesInLast7d">,
  windowDays: number,
): number {
  return windowDays <= 1 ? profile.messagesInLast24h : profile.messagesInLast7d;
}

export function createRule(): FrequencyRule {
  return {
    id: `rule_${Math.random().toString(36).slice(2, 9)}`,
    name: "New rule",
    description: "",
    enabled: true,
    channel: "all",
    conditions: [
      {
        id: `cond_${Math.random().toString(36).slice(2, 9)}`,
        field: "profile.engagementTier",
        operator: "equals",
        value: "high",
      },
    ],
    maxMessages: 5,
    windowDays: 7,
  };
}

export function createCondition(): RuleCondition {
  return {
    id: `cond_${Math.random().toString(36).slice(2, 9)}`,
    field: "profile.tenureDays",
    operator: "less_than",
    value: "180",
  };
}

/** Context paths that make sense in a governance rule, offered as suggestions. */
export const GOVERNANCE_FIELDS = [
  "profile.tenureDays",
  "profile.engagementTier",
  "profile.engagementScore",
  "profile.loyaltyTier",
  "profile.lifetimeValue",
  "profile.country",
  "profile.appInstalled",
];

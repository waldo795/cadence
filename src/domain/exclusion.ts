/**
 * Cross-journey exclusion.
 *
 * The point of this file is the *reference model*. An exclusion rule names a
 * journey **lineage key**, never a version id. When a journey is stopped and
 * rebuilt as a new version the key is carried forward, so every rule that
 * referenced it keeps working and automatically evaluates against the new
 * version's sends. Nothing has to be rewritten, and there is no window where a
 * reference silently points at a dead journey.
 */

import { didReachProfile, type MessageRecord } from "./message";
import type { ExclusionCheckConfig, JourneyDefinition, JourneyReference } from "./journey";

export interface ExclusionResult {
  excluded: boolean;
  /** The message that caused the exclusion, when one did. */
  matchedMessage?: MessageRecord;
  explanation: string;
}

/**
 * Resolves a lineage key to the version that is currently live.
 *
 * Preference order: published, then draft, then the highest version — so a
 * reference keeps resolving sensibly even mid-rebuild when the new version has
 * not been published yet.
 */
export function resolveJourneyByKey(
  key: string,
  journeys: JourneyDefinition[],
): JourneyReference | null {
  const lineage = journeys
    .filter((journey) => journey.key === key)
    .sort((a, b) => b.version - a.version);

  if (lineage.length === 0) return null;

  const live =
    lineage.find((journey) => journey.status === "published") ??
    lineage.find((journey) => journey.status === "draft") ??
    lineage[0];

  return {
    key: live.key,
    id: live.id,
    name: live.name,
    version: live.version,
    status: live.status,
  };
}

/** Every message key a journey can emit, for exclusion reference pickers. */
export function messageKeysOf(journey: JourneyDefinition): string[] {
  const keys = journey.nodes.flatMap((node) =>
    node.kind === "send_email" || node.kind === "send_push" ? [node.config.messageKey] : [],
  );
  return [...new Set(keys.filter(Boolean))];
}

/** Which journeys reference the given lineage key through an exclusion node. */
export function journeysReferencing(
  key: string,
  journeys: JourneyDefinition[],
): JourneyDefinition[] {
  return journeys.filter((journey) =>
    journey.nodes.some(
      (node) => node.kind === "exclusion_check" && node.config.journeyKey === key,
    ),
  );
}

/**
 * Decides whether a profile is excluded, given their message history.
 *
 * Matching is on `journeyKey` and `messageKey`, both of which are stable across
 * versions — so a message sent by v3 of a journey still excludes correctly once
 * v4 is live.
 */
export function evaluateExclusion(
  config: ExclusionCheckConfig,
  history: MessageRecord[],
  now: Date,
  reference: JourneyReference | null,
): ExclusionResult {
  const target = reference ? `${reference.name} (v${reference.version})` : config.journeyKey;

  if (!config.journeyKey) {
    return { excluded: false, explanation: "No journey referenced — nothing to exclude against." };
  }

  const cutoff = now.getTime() - config.withinDays * 86_400_000;

  const candidates = history.filter((record) => {
    if (record.journeyKey !== config.journeyKey) return false;
    if (config.scope === "message" && record.messageKey !== config.messageKey) return false;
    if (config.channel !== "any" && record.channel !== config.channel) return false;
    // Only messages that actually landed should suppress a later one.
    if (!didReachProfile(record)) return false;
    const sentAt = new Date(record.sentAt).getTime();
    return !Number.isNaN(sentAt) && sentAt >= cutoff && sentAt <= now.getTime();
  });

  if (candidates.length === 0) {
    const nothing =
      config.scope === "message"
        ? `"${config.messageKey}" was not sent to this profile`
        : `Nothing from ${target} reached this profile`;
    return {
      excluded: false,
      explanation: `${nothing} in the last ${config.withinDays} days.`,
    };
  }

  const mostRecent = candidates.sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  )[0];

  const daysAgo = Math.max(
    0,
    Math.round((now.getTime() - new Date(mostRecent.sentAt).getTime()) / 86_400_000),
  );

  return {
    excluded: true,
    matchedMessage: mostRecent,
    explanation: `Excluded — "${mostRecent.messageKey}" was sent by ${target} ${daysAgo === 0 ? "today" : `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`}, inside the ${config.withinDays}-day window.`,
  };
}

import type { CustomerEvent } from "@/domain/event";
import type { Profile } from "@/domain/profile";
import {
  buildTriggerEvent,
  evaluateTrigger,
  firedKey,
  type ScheduledTrigger,
  type TriggerEvaluation,
} from "@/domain/scheduled-trigger";
import { DOCUMENT_KEYS, readDoc, writeDoc } from "./storage";

/**
 * Scheduled trigger storage and firing.
 *
 * There is no scheduler in this PoC — nothing runs while the tab is closed. The
 * "run due triggers" action below is the manual stand-in for the cron job a
 * real deployment would run every few minutes. The evaluation logic it calls is
 * exactly what that job would call, so the seam is honest: only the clock is
 * missing.
 */

let triggerCache: ScheduledTrigger[] | null = null;
let firedCache: string[] | null = null;

function loadTriggers(): ScheduledTrigger[] {
  if (triggerCache) return triggerCache;
  triggerCache = readDoc<ScheduledTrigger[]>(DOCUMENT_KEYS.scheduledTriggers) ?? [];
  return triggerCache;
}

function loadFired(): string[] {
  if (firedCache) return firedCache;
  firedCache = readDoc<string[]>(DOCUMENT_KEYS.firedTriggers) ?? [];
  return firedCache;
}

export function resetScheduledTriggers(): void {
  triggerCache = null;
  firedCache = null;
}

export function allTriggersSync(): ScheduledTrigger[] {
  return loadTriggers();
}

export function saveTrigger(trigger: ScheduledTrigger): void {
  const triggers = loadTriggers();
  const index = triggers.findIndex((existing) => existing.id === trigger.id);
  const next = [...triggers];
  if (index >= 0) next[index] = trigger;
  else next.push(trigger);
  triggerCache = next;
  writeDoc(DOCUMENT_KEYS.scheduledTriggers, next);
}

export function removeTrigger(id: string): void {
  const next = loadTriggers().filter((trigger) => trigger.id !== id);
  triggerCache = next;
  writeDoc(DOCUMENT_KEYS.scheduledTriggers, next);
}

export function firedKeysSync(): Set<string> {
  return new Set(loadFired());
}

/** Evaluates every trigger against every profile, without firing anything. */
export function previewTriggers(
  profiles: Profile[],
  now: Date = new Date(),
): TriggerEvaluation[] {
  const fired = firedKeysSync();
  return loadTriggers().flatMap((trigger) =>
    profiles.map((profile) => evaluateTrigger(trigger, profile, now, fired)),
  );
}

export interface FiringResult {
  events: CustomerEvent[];
  taggedProfileIds: Map<string, string[]>;
  evaluations: TriggerEvaluation[];
}

/**
 * Fires every due trigger once.
 *
 * The fired ledger is keyed by (trigger, profile, anchor date), so re-running
 * this is safe — a bride does not get her three-month reminder twice — while a
 * changed wedding date legitimately produces a new key and fires again.
 */
export function runDueTriggers(
  profiles: Profile[],
  now: Date = new Date(),
): FiringResult {
  const triggers = loadTriggers();
  const fired = loadFired();
  const firedSet = new Set(fired);

  const events: CustomerEvent[] = [];
  const taggedProfileIds = new Map<string, string[]>();
  const evaluations: TriggerEvaluation[] = [];

  for (const trigger of triggers) {
    for (const profile of profiles) {
      const evaluation = evaluateTrigger(trigger, profile, now, firedSet);
      evaluations.push(evaluation);
      if (evaluation.status !== "due" || !evaluation.anchorDate) continue;

      events.push(buildTriggerEvent(trigger, profile, evaluation, now));

      if (trigger.addTag) {
        const existing = taggedProfileIds.get(profile.id) ?? [];
        if (!existing.includes(trigger.addTag)) existing.push(trigger.addTag);
        taggedProfileIds.set(profile.id, existing);
      }

      const key = firedKey(trigger.id, profile.id, evaluation.anchorDate);
      firedSet.add(key);
      fired.push(key);
    }
  }

  firedCache = fired;
  writeDoc(DOCUMENT_KEYS.firedTriggers, fired);

  return { events, taggedProfileIds, evaluations };
}

/** Clears the fired ledger so the demo can be replayed. */
export function resetFiredLedger(): void {
  firedCache = [];
  writeDoc(DOCUMENT_KEYS.firedTriggers, []);
}

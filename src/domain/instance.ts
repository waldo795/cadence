/**
 * Journey instances — one customer's progress through one journey.
 *
 * This is the piece that makes a journey *real* rather than simulated. The
 * engine can walk a journey end to end in one pass, which is right for a
 * preview; a live journey instead pauses at "wait three days" and resumes
 * later, possibly after a deploy, a restart, or a week of the server being
 * asleep. That requires state that outlives the process.
 *
 * An instance records exactly where someone got to and when to look at them
 * again. The scheduler then needs only one query: everything whose `wakeAt`
 * has passed.
 */

import type { CustomerEvent } from "./event";
import type { ExperimentAssignment } from "./experiment";

export type InstanceStatus =
  | "running"
  | "waiting"
  | "completed"
  | "exited"
  | "failed";

export const INSTANCE_STATUS_LABEL: Record<InstanceStatus, string> = {
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  exited: "Exited",
  failed: "Failed",
};

export const INSTANCE_STATUS_TONE: Record<
  InstanceStatus,
  "positive" | "neutral" | "warning" | "negative" | "accent"
> = {
  running: "accent",
  waiting: "neutral",
  completed: "positive",
  exited: "neutral",
  failed: "negative",
};

export interface JourneyInstance {
  id: string;
  profileId: string;
  /** Lineage key — stable across versions, used for reporting and exclusion. */
  journeyKey: string;
  /**
   * The *specific version* this instance is running.
   *
   * Pinned at entry on purpose. If the journey is edited while someone is
   * mid-flight, they keep running the version they entered on — otherwise the
   * node they are parked at could be renamed or deleted underneath them, and
   * the instance would resume into nothing.
   */
  journeyId: string;
  journeyVersion: number;
  journeyName: string;

  /** Where to resume. Null once the instance has finished. */
  currentNodeId: string | null;
  status: InstanceStatus;
  /** When the scheduler should next look at this instance. */
  wakeAt: string | null;

  /**
   * The triggering event, frozen at entry.
   *
   * Journeys read `event.*` in conditions and message copy, so the payload has
   * to survive for the whole life of the instance — it cannot be re-fetched
   * weeks later.
   */
  context: CustomerEvent;
  /** Experiment variant, frozen at entry so a reallocation cannot move anyone. */
  assignment?: ExperimentAssignment;

  enteredAt: string;
  updatedAt: string;
  completedAt: string | null;

  /** Total nodes traversed across every resumption; guards runaway loops. */
  stepCount: number;
  lastError?: string;
}

/** Instances the scheduler should pick up. */
export function isDue(instance: JourneyInstance, now: Date): boolean {
  if (instance.status !== "waiting") return false;
  if (!instance.wakeAt) return false;
  return new Date(instance.wakeAt).getTime() <= now.getTime();
}

export function isFinished(instance: JourneyInstance): boolean {
  return (
    instance.status === "completed" ||
    instance.status === "exited" ||
    instance.status === "failed"
  );
}

/**
 * A single profile may only be in a given journey once at a time.
 *
 * Re-entry while already in flight would run two copies of the same countdown
 * and send everything twice. The event that would have re-entered them is
 * recorded instead, which is the behaviour a marketer expects: a second
 * booking does not restart the reminders you are already receiving.
 */
export function activeInstanceFor(
  instances: JourneyInstance[],
  profileId: string,
  journeyKey: string,
): JourneyInstance | null {
  return (
    instances.find(
      (instance) =>
        instance.profileId === profileId &&
        instance.journeyKey === journeyKey &&
        !isFinished(instance),
    ) ?? null
  );
}

/** Across resumptions, not within one slice. */
export const MAX_INSTANCE_STEPS = 500;

export function describeWake(instance: JourneyInstance, now: Date): string {
  if (!instance.wakeAt) return "—";
  const delta = new Date(instance.wakeAt).getTime() - now.getTime();
  const days = Math.round(delta / 86_400_000);
  if (delta <= 0) return "due now";
  if (days === 0) return "later today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

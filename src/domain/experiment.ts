/**
 * Experimentation.
 *
 * Experiments are **standalone records that live outside journeys**. A journey
 * is never edited to put it under test: at entry the engine asks whether a live
 * experiment targets this journey, and if one does the profile is routed
 * accordingly. That means a running experience can be tested without being
 * interrupted, and ending an experiment is a change to the experiment alone.
 *
 * A variant routes a profile to one of three places:
 *   - `original` — the journey as it stands today (the usual control)
 *   - `journey`  — a *fork*: a separate journey definition the profile runs
 *                  instead, which is how you test a different experience
 *                  without touching the live one
 *   - `holdout`  — no experience at all, for measuring incremental impact
 *
 * When a profile is routed to a fork or a holdout, the original journey still
 * records an entry and an exit, stamped with the experiment and variant, so its
 * participation history stays complete.
 *
 * Assignment is a pure function of (experiment id, profile id). Nothing is
 * rolled or stored, so a profile re-entering the journey — today, or after the
 * journey has been rebuilt — always resolves to the same variant.
 */

export type ExperimentStatus = "draft" | "running" | "paused" | "concluded";

export type VariantTreatment =
  | { kind: "original" }
  | { kind: "journey"; journeyKey: string }
  | { kind: "holdout" };

export interface ExperimentVariant {
  id: string;
  name: string;
  /** Share of entrants, as a percentage. Variants should total 100. */
  allocation: number;
  treatment: VariantTreatment;
}

export interface Experiment {
  /**
   * The assignment key. Never regenerated — changing it reshuffles every
   * profile and invalidates results already collected.
   */
  id: string;
  name: string;
  hypothesis?: string;
  status: ExperimentStatus;
  /**
   * Lineage key of the journey under test, not a version id, so the experiment
   * survives the target journey being stopped and rebuilt.
   */
  targetJourneyKey: string;
  variants: ExperimentVariant[];
  /** What success is measured on. Without it, no lift can be reported. */
  primaryMetric?: import("./experiment-results").ExperimentMetric;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  concluded: "Concluded",
};

export const EXPERIMENT_STATUS_TONE: Record<
  ExperimentStatus,
  "neutral" | "positive" | "warning"
> = {
  draft: "neutral",
  running: "positive",
  paused: "warning",
  concluded: "neutral",
};

/** Only a running experiment intercepts traffic. */
export function isLive(experiment: Experiment): boolean {
  return experiment.status === "running";
}

export interface ExperimentAssignment {
  experimentId: string;
  experimentName: string;
  profileId: string;
  /** Stable 0–9999 position, surfaced in the UI so stickiness is observable. */
  bucket: number;
  variantId: string;
  variantName: string;
  treatment: VariantTreatment;
  reason: string;
}

/** FNV-1a. Stable, dependency-free and evenly distributed. */
function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const TOTAL_BUCKETS = 10_000;

/** Maps any key onto a stable 0–9999 bucket (basis points of the audience). */
export function bucketFor(key: string): number {
  return fnv1a(key) % TOTAL_BUCKETS;
}

export function totalAllocation(experiment: Experiment): number {
  return experiment.variants.reduce((sum, variant) => sum + variant.allocation, 0);
}

export function describeTreatment(treatment: VariantTreatment): string {
  switch (treatment.kind) {
    case "original":
      return "Original journey";
    case "journey":
      return `Fork → ${treatment.journeyKey}`;
    case "holdout":
      return "Holdout (no experience)";
  }
}

/**
 * Assigns a profile to a variant.
 *
 * Pure and total. Any allocation shortfall falls through to the original
 * journey, so a misconfigured experiment degrades to "business as usual"
 * rather than dropping profiles on the floor.
 */
export function assignProfile(
  experiment: Experiment,
  profileId: string,
): ExperimentAssignment {
  const bucket = bucketFor(`${experiment.id}:${profileId}`);

  let cursor = 0;
  for (const variant of experiment.variants) {
    const width = Math.round(variant.allocation * 100);
    if (bucket < cursor + width) {
      return {
        experimentId: experiment.id,
        experimentName: experiment.name,
        profileId,
        bucket,
        variantId: variant.id,
        variantName: variant.name,
        treatment: variant.treatment,
        reason: `Bucket ${bucket} falls in "${variant.name}" (${cursor}–${cursor + width - 1} of ${TOTAL_BUCKETS}).`,
      };
    }
    cursor += width;
  }

  return {
    experimentId: experiment.id,
    experimentName: experiment.name,
    profileId,
    bucket,
    variantId: "__unallocated__",
    variantName: "Original journey",
    treatment: { kind: "original" },
    reason: `Bucket ${bucket} is outside the allocated ${cursor / 100}% — falls through to the original journey.`,
  };
}

export function createVariant(name: string, allocation: number): ExperimentVariant {
  return {
    id: `var_${Math.random().toString(36).slice(2, 9)}`,
    name,
    allocation,
    treatment: { kind: "original" },
  };
}

export function createExperiment(targetJourneyKey: string, targetName: string): Experiment {
  return {
    id: `exp_${Math.random().toString(36).slice(2, 10)}`,
    name: `${targetName} test`,
    hypothesis: "",
    status: "draft",
    targetJourneyKey,
    variants: [
      { ...createVariant("Control", 50), treatment: { kind: "original" } },
      { ...createVariant("Variant A", 50), treatment: { kind: "original" } },
    ],
    createdAt: new Date().toISOString(),
  };
}

export interface ExperimentIssue {
  level: "error" | "warning";
  message: string;
}

/** Guardrails surfaced in the editor before an experiment can be started. */
export function validateExperiment(
  experiment: Experiment,
  knownJourneyKeys: string[],
): ExperimentIssue[] {
  const issues: ExperimentIssue[] = [];
  const total = totalAllocation(experiment);

  if (!experiment.targetJourneyKey) {
    issues.push({ level: "error", message: "Choose the journey this experiment tests." });
  } else if (!knownJourneyKeys.includes(experiment.targetJourneyKey)) {
    issues.push({
      level: "error",
      message: `Target journey "${experiment.targetJourneyKey}" no longer exists.`,
    });
  }

  if (experiment.variants.length < 2) {
    issues.push({ level: "warning", message: "An experiment needs at least two variants." });
  }

  if (total > 100) {
    issues.push({ level: "error", message: `Allocation totals ${total}% — it cannot exceed 100%.` });
  } else if (total < 100) {
    issues.push({
      level: "warning",
      message: `Allocation totals ${total}%. The remaining ${100 - total}% runs the original journey.`,
    });
  }

  for (const variant of experiment.variants) {
    if (variant.treatment.kind !== "journey") continue;
    if (!variant.treatment.journeyKey) {
      issues.push({
        level: "error",
        message: `"${variant.name}" is routed to a fork but no journey is selected.`,
      });
    } else if (!knownJourneyKeys.includes(variant.treatment.journeyKey)) {
      issues.push({
        level: "error",
        message: `"${variant.name}" points at missing journey "${variant.treatment.journeyKey}".`,
      });
    } else if (variant.treatment.journeyKey === experiment.targetJourneyKey) {
      issues.push({
        level: "error",
        message: `"${variant.name}" forks to the journey under test, which would loop.`,
      });
    }
  }

  return issues;
}

import type { ExperimentAssignment, Experiment } from "@/domain/experiment";
import {
  attributeConversion,
  computeResults,
  type ExperimentBaseline,
  type ExperimentExposure,
  type ExperimentResults,
  type VariantTotals,
} from "@/domain/experiment-results";
import type { CustomerEvent } from "@/domain/event";
import { DOCUMENT_KEYS, readDoc, readEvents, writeDoc } from "./storage";

/**
 * The measurement store.
 *
 * Exposures are the only thing that must be written on the hot path, and they
 * are written at most once per profile per experiment. Conversions are derived
 * at read time from the event log rather than duplicated here — an event log is
 * already the record of what happened, and copying it would let the two drift.
 */

let exposureCache: ExperimentExposure[] | null = null;
let baselineCache: ExperimentBaseline[] | null = null;

function loadExposures(): ExperimentExposure[] {
  if (exposureCache) return exposureCache;
  exposureCache = readDoc<ExperimentExposure[]>(DOCUMENT_KEYS.exposures) ?? [];
  return exposureCache;
}

function loadBaselines(): ExperimentBaseline[] {
  if (baselineCache) return baselineCache;
  baselineCache = readDoc<ExperimentBaseline[]>(DOCUMENT_KEYS.experimentBaselines) ?? [];
  return baselineCache;
}

/*
 * Attribution reads the live event log rather than the seed. Events now arrive
 * from scheduled triggers and the sign-up form as well as the seed, and a
 * conversion that happened after the app started must still be counted.
 */
let eventIndex: Map<string, CustomerEvent[]> | null = null;

function eventsForProfile(profileId: string): CustomerEvent[] {
  if (!eventIndex) {
    eventIndex = new Map();
    for (const event of readEvents()) {
      const existing = eventIndex.get(event.profileId) ?? [];
      existing.push(event);
      eventIndex.set(event.profileId, existing);
    }
  }
  return eventIndex.get(profileId) ?? [];
}

export function resetExperimentResults(): void {
  exposureCache = null;
  baselineCache = null;
  eventIndex = null;
}

export function allExposuresSync(): ExperimentExposure[] {
  return loadExposures();
}

/**
 * Records that a profile entered an experiment.
 *
 * Returns whether this was a *new* exposure. Re-entry increments the counter
 * and updates the timestamp but deliberately does not add a row: the exposure
 * denominator must count people, not visits, or every returning customer would
 * quietly dilute the conversion rate of whichever variant they re-enter.
 */
export function recordExposure(
  experimentId: string,
  assignment: ExperimentAssignment,
  at: Date = new Date(),
): { created: boolean; exposure: ExperimentExposure } {
  const exposures = loadExposures();
  const existing = exposures.find(
    (exposure) =>
      exposure.experimentId === experimentId && exposure.profileId === assignment.profileId,
  );

  if (existing) {
    existing.entryCount += 1;
    existing.lastExposedAt = at.toISOString();
    // The variant is *not* refreshed from the assignment. It cannot change —
    // assignment is deterministic — and pinning it means a later edit to the
    // allocation cannot retroactively rewrite who was measured in which arm.
    writeDoc(DOCUMENT_KEYS.exposures, exposures);
    return { created: false, exposure: existing };
  }

  const exposure: ExperimentExposure = {
    experimentId,
    profileId: assignment.profileId,
    variantId: assignment.variantId,
    variantName: assignment.variantName,
    firstExposedAt: at.toISOString(),
    entryCount: 1,
    lastExposedAt: at.toISOString(),
  };

  exposures.push(exposure);
  writeDoc(DOCUMENT_KEYS.exposures, exposures);
  return { created: true, exposure };
}

/** Combines seeded historical totals with the live exposure ledger. */
export function resultsFor(experiment: Experiment): ExperimentResults {
  const ledger = loadExposures().filter(
    (exposure) => exposure.experimentId === experiment.id,
  );

  const totals = new Map<string, VariantTotals>();
  for (const variant of experiment.variants) {
    totals.set(variant.id, { exposures: 0, conversions: 0, revenue: 0 });
  }

  const baseline = loadBaselines().find((item) => item.experimentId === experiment.id);
  if (baseline) {
    for (const variantTotals of baseline.variants) {
      const current = totals.get(variantTotals.variantId);
      if (!current) continue;
      current.exposures += variantTotals.exposures;
      current.conversions += variantTotals.conversions;
      current.revenue += variantTotals.revenue;
    }
  }

  const metric = experiment.primaryMetric;
  for (const exposure of ledger) {
    const current = totals.get(exposure.variantId);
    if (!current) continue;
    current.exposures += 1;

    if (!metric) continue;
    const conversion = attributeConversion(
      exposure,
      metric,
      eventsForProfile(exposure.profileId),
    );
    if (conversion) {
      current.conversions += 1;
      current.revenue += conversion.value;
    }
  }

  return computeResults(experiment, totals, ledger);
}

export function baselineNoteFor(experimentId: string): string | null {
  return loadBaselines().find((item) => item.experimentId === experimentId)?.note ?? null;
}

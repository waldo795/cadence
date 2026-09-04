/**
 * Experiment measurement: exposures, conversions and lift.
 *
 * Assignment stays a pure hash — nothing here is needed to decide which variant
 * a profile gets. What *is* persisted is the record that a profile actually
 * entered, because a hash tells you which group someone would be in, not that
 * they were ever exposed to anything. Without that record there is no honest
 * denominator, and without an honest denominator there is no lift.
 *
 * The single most important rule in this file: **one exposure per profile per
 * experiment**. Re-entry bumps a counter, it never adds a row. If re-entries
 * created new exposures the denominator would inflate every time a customer
 * came back, quietly deflating the conversion rate of whichever variant happens
 * to re-trigger most often.
 */

import type { CustomerEvent } from "./event";
import type { Experiment, ExperimentVariant } from "./experiment";

export interface ExperimentMetric {
  id: string;
  name: string;
  /** The event that counts as a conversion. */
  eventName: string;
  /** A conversion only counts if it lands within this many days of exposure. */
  attributionWindowDays: number;
  /** Optional numeric payload field summed as revenue, e.g. `total`. */
  valueField?: string;
}

export interface ExperimentExposure {
  experimentId: string;
  profileId: string;
  variantId: string;
  variantName: string;
  /** The exposure that counts. Attribution windows are measured from here. */
  firstExposedAt: string;
  /** Re-entries increment this rather than creating another exposure. */
  entryCount: number;
  lastExposedAt: string;
}

/**
 * Pre-aggregated historical volume.
 *
 * Individual exposure rows are kept for profiles in the demo dataset, but a
 * credible lift report needs thousands of observations. Rather than write tens
 * of thousands of rows into localStorage, the seeded history is stored as
 * per-variant totals and summed with the live rows. A warehouse-backed
 * implementation would compute both sides with one query.
 */
export interface VariantBaseline {
  variantId: string;
  exposures: number;
  conversions: number;
  revenue: number;
}

export interface ExperimentBaseline {
  experimentId: string;
  /** Human note explaining that this volume is synthetic demo traffic. */
  note: string;
  variants: VariantBaseline[];
}

/* -------------------------------------------------------------------------- */
/* Attribution                                                                */
/* -------------------------------------------------------------------------- */

export interface AttributedConversion {
  profileId: string;
  variantId: string;
  occurredAt: string;
  value: number;
}

function numericField(event: CustomerEvent, field: string | undefined): number {
  if (!field) return 0;
  const value = event.payload[field];
  return typeof value === "number" ? value : 0;
}

/**
 * Finds the first qualifying conversion for one exposure.
 *
 * First-touch on purpose: counting every subsequent purchase would measure
 * frequency, not whether the experience converted anyone.
 */
export function attributeConversion(
  exposure: ExperimentExposure,
  metric: ExperimentMetric,
  events: CustomerEvent[],
): AttributedConversion | null {
  const exposedAt = new Date(exposure.firstExposedAt).getTime();
  if (Number.isNaN(exposedAt)) return null;
  const deadline = exposedAt + metric.attributionWindowDays * 86_400_000;

  const qualifying = events
    .filter((event) => {
      if (event.name !== metric.eventName) return false;
      const at = new Date(event.occurredAt).getTime();
      // Strictly after exposure: an event that already happened cannot have
      // been caused by an experience the customer had not yet seen.
      return !Number.isNaN(at) && at > exposedAt && at <= deadline;
    })
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const first = qualifying[0];
  if (!first) return null;

  return {
    profileId: exposure.profileId,
    variantId: exposure.variantId,
    occurredAt: first.occurredAt,
    value: numericField(first, metric.valueField),
  };
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

/** Abramowitz & Stegun 7.1.26. Accurate to ~1.5e-7, ample for a p-value. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Below these, a difference is noise however tempting it looks. */
export const MIN_EXPOSURES_PER_ARM = 100;
export const MIN_CONVERSIONS_PER_ARM = 30;
export const SIGNIFICANCE_LEVEL = 0.05;

export interface ComparisonStats {
  /** Relative lift vs the baseline, e.g. 0.238 for +23.8%. */
  lift: number;
  absoluteDifference: number;
  /** 95% interval on the absolute difference in conversion rate. */
  confidenceInterval: [number, number];
  pValue: number;
  significant: boolean;
}

/**
 * Two-proportion z-test.
 *
 * The pooled standard error is used for the test statistic and the unpooled one
 * for the interval — the standard convention, since the test assumes the null
 * (equal rates) while the interval should not.
 */
export function compareProportions(
  baselineConversions: number,
  baselineExposures: number,
  variantConversions: number,
  variantExposures: number,
): ComparisonStats | null {
  if (baselineExposures <= 0 || variantExposures <= 0) return null;

  const p1 = baselineConversions / baselineExposures;
  const p2 = variantConversions / variantExposures;
  const absoluteDifference = p2 - p1;

  const pooled =
    (baselineConversions + variantConversions) / (baselineExposures + variantExposures);
  const pooledSe = Math.sqrt(
    pooled * (1 - pooled) * (1 / baselineExposures + 1 / variantExposures),
  );

  const z = pooledSe === 0 ? 0 : absoluteDifference / pooledSe;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  const unpooledSe = Math.sqrt(
    (p1 * (1 - p1)) / baselineExposures + (p2 * (1 - p2)) / variantExposures,
  );
  const margin = 1.959964 * unpooledSe;

  return {
    lift: p1 === 0 ? 0 : absoluteDifference / p1,
    absoluteDifference,
    confidenceInterval: [absoluteDifference - margin, absoluteDifference + margin],
    pValue,
    significant: pValue < SIGNIFICANCE_LEVEL,
  };
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export type Readiness = "no_data" | "collecting" | "ready";

export interface VariantResult {
  variantId: string;
  variantName: string;
  isBaseline: boolean;
  exposures: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  revenuePerExposure: number;
  /** Null on the baseline itself, or when there is too little data to compare. */
  stats: ComparisonStats | null;
  /** Why `stats` is null, when it is. */
  note?: string;
}

export interface ExperimentResults {
  metric: ExperimentMetric | null;
  variants: VariantResult[];
  baselineVariantId: string | null;
  totalExposures: number;
  readiness: Readiness;
  summary: string;
  /** Live exposure rows, for showing that re-entry does not double-count. */
  ledger: ExperimentExposure[];
}

/**
 * Chooses what everything else is measured against.
 *
 * A holdout wins if there is one: for an incrementality test the untreated
 * group is the only true baseline. Otherwise the variant running the original
 * journey is the control.
 */
export function baselineVariantOf(experiment: Experiment): ExperimentVariant | null {
  return (
    experiment.variants.find((variant) => variant.treatment.kind === "holdout") ??
    experiment.variants.find((variant) => variant.treatment.kind === "original") ??
    experiment.variants[0] ??
    null
  );
}

export interface VariantTotals {
  exposures: number;
  conversions: number;
  revenue: number;
}

export function computeResults(
  experiment: Experiment,
  totalsByVariant: Map<string, VariantTotals>,
  ledger: ExperimentExposure[],
): ExperimentResults {
  const metric = experiment.primaryMetric ?? null;
  const baseline = baselineVariantOf(experiment);
  const baselineTotals = baseline
    ? (totalsByVariant.get(baseline.id) ?? { exposures: 0, conversions: 0, revenue: 0 })
    : null;

  const variants: VariantResult[] = experiment.variants.map((variant) => {
    const totals = totalsByVariant.get(variant.id) ?? {
      exposures: 0,
      conversions: 0,
      revenue: 0,
    };
    const isBaseline = baseline?.id === variant.id;

    let stats: ComparisonStats | null = null;
    let note: string | undefined;

    if (!isBaseline && baselineTotals) {
      const underpowered =
        totals.exposures < MIN_EXPOSURES_PER_ARM ||
        baselineTotals.exposures < MIN_EXPOSURES_PER_ARM ||
        totals.conversions < MIN_CONVERSIONS_PER_ARM ||
        baselineTotals.conversions < MIN_CONVERSIONS_PER_ARM;

      if (underpowered) {
        note = `Needs at least ${MIN_EXPOSURES_PER_ARM} exposures and ${MIN_CONVERSIONS_PER_ARM} conversions per arm before a comparison means anything.`;
      } else {
        stats = compareProportions(
          baselineTotals.conversions,
          baselineTotals.exposures,
          totals.conversions,
          totals.exposures,
        );
      }
    }

    return {
      variantId: variant.id,
      variantName: variant.name,
      isBaseline,
      exposures: totals.exposures,
      conversions: totals.conversions,
      conversionRate: totals.exposures === 0 ? 0 : totals.conversions / totals.exposures,
      revenue: totals.revenue,
      revenuePerExposure: totals.exposures === 0 ? 0 : totals.revenue / totals.exposures,
      stats,
      note,
    };
  });

  const totalExposures = variants.reduce((sum, variant) => sum + variant.exposures, 0);
  const comparable = variants.filter((variant) => !variant.isBaseline);
  const anyStats = comparable.some((variant) => variant.stats !== null);

  const readiness: Readiness =
    totalExposures === 0 ? "no_data" : anyStats ? "ready" : "collecting";

  let summary: string;
  if (!metric) {
    summary = "No primary metric is defined, so nothing can be measured yet.";
  } else if (readiness === "no_data") {
    summary = "No profiles have entered this experiment yet.";
  } else if (readiness === "collecting") {
    summary = `Collecting data — ${totalExposures.toLocaleString()} exposures so far, not yet enough to compare.`;
  } else {
    const winners = comparable.filter((variant) => variant.stats?.significant);
    const best = [...winners].sort((a, b) => (b.stats?.lift ?? 0) - (a.stats?.lift ?? 0))[0];
    summary = best
      ? `"${best.variantName}" is ${formatLift(best.stats!.lift)} vs ${
          variants.find((variant) => variant.isBaseline)?.variantName ?? "baseline"
        } on ${metric.name} (p = ${best.stats!.pValue.toFixed(4)}).`
      : `No variant differs significantly from the baseline at the ${Math.round(SIGNIFICANCE_LEVEL * 100)}% level.`;
  }

  return {
    metric,
    variants,
    baselineVariantId: baseline?.id ?? null,
    totalExposures,
    readiness,
    summary,
    ledger,
  };
}

export function formatLift(lift: number): string {
  const sign = lift >= 0 ? "+" : "";
  return `${sign}${(lift * 100).toFixed(1)}%`;
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

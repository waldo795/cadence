import { assignProfile, type Experiment } from "@/domain/experiment";
import type { ExperimentBaseline, ExperimentExposure } from "@/domain/experiment-results";

/**
 * Seeded measurement data.
 *
 * Two layers, for two different jobs:
 *
 *  - **Baselines** are per-variant totals standing in for historical traffic.
 *    A lift report is meaningless at n=9, and writing tens of thousands of rows
 *    into localStorage to prove that point would be silly. These are synthetic
 *    demo numbers, and the UI says so — but the statistics computed from them
 *    are real, so the significance shown is genuinely derived, not asserted.
 *
 *  - **Exposure rows** are individual records for the nine demo profiles,
 *    backdated so their seeded event history falls inside the attribution
 *    window. These are what demonstrate the mechanics: one row per profile, an
 *    entry counter that increments on re-entry, and conversions attributed from
 *    the real event log.
 */

export function seedExperimentBaselines(): ExperimentBaseline[] {
  return [
    {
      experimentId: "exp_feedback_holdout",
      note: "Synthetic historical volume for the demo — 1,140 past clients since the test started. A real business of this size would take a long time to reach these numbers.",
      variants: [
        // Baseline: 8.3% leave a review unprompted. Asking roughly doubles it.
        { variantId: "var_feedback_holdout", exposures: 228, conversions: 19, revenue: 0 },
        { variantId: "var_feedback_treated", exposures: 912, conversions: 158, revenue: 0 },
      ],
    },
  ];
}

/**
 * One exposure per demo profile per running experiment, backdated so real
 * seeded events land inside the attribution window.
 */
export function seedExperimentExposures(
  now: Date,
  experiments: Experiment[],
  profileIds: string[],
): ExperimentExposure[] {
  const exposures: ExperimentExposure[] = [];

  for (const experiment of experiments) {
    if (experiment.status !== "running") continue;

    profileIds.forEach((profileId, index) => {
      const assignment = assignProfile(experiment, profileId);
      // Staggered entry so the ledger does not look machine-generated, and far
      // enough back that the profile's seeded events can be attributed.
      const daysAgo = 12 + (index % 5) * 2;
      const firstExposedAt = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

      exposures.push({
        experimentId: experiment.id,
        profileId,
        variantId: assignment.variantId,
        variantName: assignment.variantName,
        firstExposedAt,
        entryCount: 1 + (index % 3),
        lastExposedAt: new Date(
          now.getTime() - Math.max(0, daysAgo - 4) * 86_400_000,
        ).toISOString(),
      });
    });
  }

  return exposures;
}

import type { Experiment } from "@/domain/experiment";

/**
 * One seeded experiment, sized for a small business.
 *
 * A holdout is the right first test here: the question that matters is not
 * "which subject line wins" but "does asking at all produce more reviews than
 * not asking". With low weekly volume a holdout also takes far less traffic to
 * answer than an A/B on wording.
 */
export function seedExperiments(): Experiment[] {
  return [
    {
      id: "exp_feedback_holdout",
      name: "Feedback request holdout",
      hypothesis:
        "Asking six weeks after the wedding produces materially more reviews than not asking. A 20% holdout gives the counterfactual.",
      status: "running",
      targetJourneyKey: "post-wedding-feedback",
      // Holdout first: variants allocate in order, and the lowest buckets are
      // the ones the holdout has always occupied.
      variants: [
        {
          id: "var_feedback_holdout",
          name: "Holdout · no request",
          allocation: 20,
          treatment: { kind: "holdout" },
        },
        {
          id: "var_feedback_treated",
          name: "Sent the request",
          allocation: 80,
          treatment: { kind: "original" },
        },
      ],
      primaryMetric: {
        id: "metric_review",
        name: "Review submitted",
        eventName: "review.submitted",
        attributionWindowDays: 21,
      },
      createdAt: "2026-05-02T09:00:00.000Z",
      startedAt: "2026-05-09T09:00:00.000Z",
    },
  ];
}

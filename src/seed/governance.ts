import type { ContactPolicy } from "@/domain/governance";

/**
 * The seeded air traffic control policy.
 *
 * The ceiling is set at the most permissive rate any customer should ever see;
 * every rule below reduces from it. That ordering is what makes the engagement
 * rules meaningful — "highly engaged customers can have 7 per week" is the
 * ceiling itself, and everyone else is pulled down from there.
 */
export function seedContactPolicy(): ContactPolicy {
  return {
    ceilingMaxMessages: 7,
    ceilingWindowDays: 7,
    rules: [
      {
        id: "rule_new_customer",
        name: "New customer ease-in",
        description:
          "Customers who registered in the last 6 months are contacted gently while they form a habit.",
        enabled: true,
        channel: "all",
        conditions: [
          {
            id: "cond_new_1",
            field: "profile.tenureDays",
            operator: "less_than",
            value: "180",
          },
        ],
        maxMessages: 3,
        windowDays: 7,
      },
      {
        id: "rule_high_engagement",
        name: "Highly engaged",
        description:
          "Customers who consistently open and click tolerate the full workspace ceiling.",
        enabled: true,
        channel: "all",
        conditions: [
          {
            id: "cond_high_1",
            field: "profile.engagementTier",
            operator: "equals",
            value: "high",
          },
        ],
        maxMessages: 7,
        windowDays: 7,
      },
      {
        id: "rule_medium_engagement",
        name: "Moderately engaged",
        description: "The default working cap for customers with average engagement.",
        enabled: true,
        channel: "all",
        conditions: [
          {
            id: "cond_med_1",
            field: "profile.engagementTier",
            operator: "equals",
            value: "medium",
          },
        ],
        maxMessages: 5,
        windowDays: 7,
      },
      {
        id: "rule_low_engagement",
        name: "Low engagement protection",
        description:
          "Customers who rarely engage are contacted less, to protect deliverability and avoid churn.",
        enabled: true,
        channel: "all",
        conditions: [
          {
            id: "cond_low_1",
            field: "profile.engagementTier",
            operator: "equals",
            value: "low",
          },
        ],
        maxMessages: 4,
        windowDays: 7,
      },
      {
        id: "rule_push_daily",
        name: "Push daily limit",
        description: "Push is more intrusive than email, so it carries its own daily ceiling.",
        enabled: true,
        channel: "push",
        conditions: [],
        maxMessages: 1,
        windowDays: 1,
      },
    ],
  };
}

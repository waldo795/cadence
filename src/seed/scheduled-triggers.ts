import type { ScheduledTrigger } from "@/domain/scheduled-trigger";

/**
 * The wedding countdown.
 *
 * Each of these watches the same anchor — the bride's wedding date — at a
 * different offset, and emits a distinct event. Journeys listen for the events,
 * so the countdown schedule and the message content are edited independently:
 * moving the three-month reminder to four months is a change here, and needs no
 * edit to the journey that sends it.
 */
export function seedScheduledTriggers(): ScheduledTrigger[] {
  const confirmedBride = [
    {
      id: "c_booking",
      field: "profile.bookingStatus",
      operator: "equals" as const,
      value: "confirmed",
    },
  ];

  return [
    {
      id: "trg_countdown_3m",
      name: "Three months to go",
      description:
        "Skincare prep reminder. Far enough out that a bride can still act on advice about facials and treatments.",
      enabled: true,
      anchorField: "profile.weddingDate",
      offsetValue: -3,
      offsetUnit: "months",
      conditions: confirmedBride,
      catchUpDays: 3,
      addTag: "countdown-3m",
      eventName: "wedding.countdown.3months",
      payload: [
        { id: "p31", key: "weddingDate", value: "{{trigger.anchorDateShort}}" },
        { id: "p32", key: "daysUntil", value: "{{trigger.daysUntilAnchor}}" },
        { id: "p33", key: "milestone", value: "3-months" },
        { id: "p34", key: "venue", value: "{{profile.venue}}" },
      ],
      createdAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "trg_countdown_1w",
      name: "One week to go",
      description: "Final details: timings, location, what to have ready on the day.",
      enabled: true,
      anchorField: "profile.weddingDate",
      offsetValue: -7,
      offsetUnit: "days",
      conditions: confirmedBride,
      catchUpDays: 2,
      addTag: "countdown-1w",
      eventName: "wedding.countdown.1week",
      payload: [
        { id: "p11", key: "weddingDate", value: "{{trigger.anchorDateShort}}" },
        { id: "p12", key: "daysUntil", value: "{{trigger.daysUntilAnchor}}" },
        { id: "p13", key: "milestone", value: "1-week" },
        { id: "p14", key: "startTime", value: "{{profile.readyByTime}}" },
        { id: "p15", key: "venue", value: "{{profile.venue}}" },
      ],
      createdAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "trg_night_before",
      name: "Night before",
      description: "Short reassurance message with the arrival time.",
      enabled: true,
      anchorField: "profile.weddingDate",
      offsetValue: -1,
      offsetUnit: "days",
      conditions: confirmedBride,
      catchUpDays: 1,
      addTag: "countdown-night-before",
      eventName: "wedding.countdown.nightbefore",
      payload: [
        { id: "pn1", key: "weddingDate", value: "{{trigger.anchorDateShort}}" },
        { id: "pn2", key: "milestone", value: "night-before" },
        { id: "pn3", key: "arrivalTime", value: "{{profile.readyByTime}}" },
        { id: "pn4", key: "venue", value: "{{profile.venue}}" },
      ],
      createdAt: "2026-01-05T09:00:00.000Z",
    },
    {
      id: "trg_feedback_6w",
      name: "Feedback request",
      description:
        "Six weeks after the wedding — long enough for photographs to be back, which is when people are most willing to review.",
      enabled: true,
      anchorField: "profile.weddingDate",
      offsetValue: 6,
      offsetUnit: "weeks",
      conditions: confirmedBride,
      catchUpDays: 14,
      addTag: "past-bride",
      eventName: "wedding.feedback.due",
      payload: [
        { id: "pf1", key: "weddingDate", value: "{{trigger.anchorDateShort}}" },
        { id: "pf2", key: "milestone", value: "post-6-weeks" },
        { id: "pf3", key: "service", value: "{{profile.serviceBooked}}" },
      ],
      createdAt: "2026-01-05T09:00:00.000Z",
    },
  ];
}

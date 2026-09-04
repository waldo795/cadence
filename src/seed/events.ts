import type { CustomerEvent, EventTemplate } from "@/domain/event";

/**
 * The event vocabulary for a bridal makeup business.
 *
 * The countdown events are not listed as things a website sends — they are
 * emitted by scheduled triggers. They appear here so they can be picked when
 * simulating a journey without having to fire the trigger first.
 */
export function seedEventTemplates(now: Date): EventTemplate[] {
  const weddingDate = new Date(now.getTime() + 91 * 86_400_000).toISOString().slice(0, 10);

  return [
    {
      name: "enquiry.submitted",
      label: "Enquiry submitted",
      description: "Someone completed the enquiry form on the website.",
      samplePayload: {
        source: "website-form",
        weddingDate,
        venue: "Hedingham Barn",
        partySize: 4,
        message: "Looking for bridal makeup for me and 3 bridesmaids.",
      },
    },
    {
      name: "booking.confirmed",
      label: "Booking confirmed",
      description: "A booking has been confirmed and the deposit paid.",
      samplePayload: {
        weddingDate,
        venue: "Hedingham Barn",
        serviceBooked: "Bridal makeup + 3 bridesmaids",
        partySize: 4,
        depositPaid: true,
        total: 640,
      },
    },
    {
      name: "wedding.countdown.3months",
      label: "Countdown · 3 months",
      description: "Emitted by the 'Three months to go' scheduled trigger.",
      samplePayload: {
        weddingDate,
        daysUntil: 91,
        milestone: "3-months",
        venue: "Hedingham Barn",
      },
    },
    {
      name: "wedding.countdown.1week",
      label: "Countdown · 1 week",
      description: "Emitted by the 'One week to go' scheduled trigger.",
      samplePayload: {
        weddingDate,
        daysUntil: 7,
        milestone: "1-week",
        startTime: "11:30",
        venue: "Hedingham Barn",
      },
    },
    {
      name: "wedding.countdown.nightbefore",
      label: "Countdown · Night before",
      description: "Emitted by the 'Night before' scheduled trigger.",
      samplePayload: {
        weddingDate,
        milestone: "night-before",
        arrivalTime: "11:30",
        venue: "Hedingham Barn",
      },
    },
    {
      name: "wedding.feedback.due",
      label: "Feedback due",
      description: "Emitted six weeks after the wedding.",
      samplePayload: {
        weddingDate,
        milestone: "post-6-weeks",
        service: "Bridal makeup + 3 bridesmaids",
      },
    },
    {
      name: "trial.booked",
      label: "Trial booked",
      description: "The client booked their makeup trial.",
      samplePayload: { trialDate: weddingDate, location: "Studio" },
    },
    {
      name: "review.submitted",
      label: "Review submitted",
      description: "The client left a review. Used as the feedback journey's success metric.",
      samplePayload: { rating: 5, platform: "Google" },
    },
    {
      name: "referral.made",
      label: "Referral made",
      description: "The client referred someone who enquired.",
      samplePayload: { referredEmail: "friend@example.test" },
    },
  ];
}

/**
 * A little recent activity per client so the profile timelines are not empty.
 * Deterministic, so attribution windows behave the same on every load.
 */
export function seedEvents(now: Date, profileIds: string[]): CustomerEvent[] {
  const events: CustomerEvent[] = [];

  profileIds.forEach((profileId, index) => {
    const base = now.getTime() - (index + 1) * 26 * 3_600_000;

    events.push({
      id: `evt_${profileId}_enquiry`,
      name: "enquiry.submitted",
      profileId,
      occurredAt: new Date(base - 40 * 86_400_000).toISOString(),
      payload: { source: "website-form" },
    });

    if (index % 3 !== 2) {
      events.push({
        id: `evt_${profileId}_booking`,
        name: "booking.confirmed",
        profileId,
        occurredAt: new Date(base - 30 * 86_400_000).toISOString(),
        payload: { depositPaid: true, total: 480 + index * 60 },
      });
    }

    if (index % 2 === 0) {
      events.push({
        id: `evt_${profileId}_trial`,
        name: "trial.booked",
        profileId,
        occurredAt: new Date(base - 12 * 86_400_000).toISOString(),
        payload: { location: "Studio" },
      });
    }

    // Reviews land shortly after the seeded feedback exposure, so the
    // experiment's attribution window has something to find.
    if (index % 4 === 0) {
      events.push({
        id: `evt_${profileId}_review`,
        name: "review.submitted",
        profileId,
        occurredAt: new Date(base - 3 * 86_400_000).toISOString(),
        payload: { rating: 5, platform: "Google" },
      });
    }
  });

  return events.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

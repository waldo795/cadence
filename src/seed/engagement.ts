import type { MessageRecord, MessageStatus } from "@/domain/message";
import type { JourneyParticipation, ParticipationStatus } from "@/domain/participation";
import type { Profile } from "@/domain/profile";

const BOOKING = {
  id: "journey_booking_confirmation",
  key: "booking-confirmation",
  name: "Booking confirmation",
};
const COUNTDOWN_3M = {
  id: "journey_countdown_3m",
  key: "countdown-3-months",
  name: "Three months to go",
};

/**
 * Message history and live participations are seeded rather than derived, so
 * the client list looks like a running business on first load.
 */
export function seedMessages(now: Date, profiles: Profile[]): MessageRecord[] {
  const records: MessageRecord[] = [];

  profiles.forEach((profile, index) => {
    const base = now.getTime() - (index + 1) * 22 * 3_600_000;

    const status: MessageStatus =
      profile.contactability.globallySuppressed || profile.contactability.email !== "subscribed"
        ? "suppressed"
        : index % 3 === 0
          ? "opened"
          : "delivered";

    records.push({
      id: `msg_${profile.id}_booking`,
      profileId: profile.id,
      channel: "email",
      template: "booking-confirmation",
      messageKey: "booking-confirmation",
      subject: `You're booked in, ${profile.firstName}`,
      body: "Lovely to have you booked in. I'll be in touch nearer the time.",
      status,
      sentAt: new Date(base - 28 * 86_400_000).toISOString(),
      journeyId: BOOKING.id,
      journeyKey: BOOKING.key,
      journeyName: BOOKING.name,
    });

    if (index % 2 === 1) {
      records.push({
        id: `msg_${profile.id}_prep`,
        profileId: profile.id,
        channel: "email",
        template: "prep-3-months-email",
        messageKey: "countdown-3m",
        subject: "Three months to go — your skin prep guide",
        body: "This is the ideal moment to start prepping.",
        status: status === "suppressed" ? "suppressed" : "delivered",
        sentAt: new Date(base - 6 * 86_400_000).toISOString(),
        journeyId: COUNTDOWN_3M.id,
        journeyKey: COUNTDOWN_3M.key,
        journeyName: COUNTDOWN_3M.name,
      });
    }
  });

  return records.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

export function seedParticipations(now: Date, profiles: Profile[]): JourneyParticipation[] {
  const participations: JourneyParticipation[] = [];

  profiles.forEach((profile, index) => {
    if (profile.attributes.bookingStatus !== "confirmed") return;

    const status: ParticipationStatus =
      index % 3 === 0 ? "waiting" : index % 3 === 1 ? "in_progress" : "completed";

    participations.push({
      id: `part_${profile.id}_booking`,
      profileId: profile.id,
      journeyId: BOOKING.id,
      journeyKey: BOOKING.key,
      journeyName: BOOKING.name,
      status,
      currentStep:
        status === "waiting" ? "Wait 3 days" : status === "in_progress" ? "Trial booked?" : "Exit",
      enteredAt: new Date(now.getTime() - (index + 2) * 86_400_000).toISOString(),
      nextEvaluationAt:
        status === "completed"
          ? null
          : new Date(now.getTime() + (5 - (index % 4)) * 86_400_000).toISOString(),
    });
  });

  return participations;
}

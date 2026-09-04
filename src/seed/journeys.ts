import type { JourneyDefinition, JourneyEdge, JourneyNode } from "@/domain/journey";

/**
 * Seeded journeys for a bridal makeup business, in the order they matter.
 *
 * Every countdown journey is started by an *event* emitted by a scheduled
 * trigger, never by date logic inside the journey. That keeps the schedule
 * ("when does three months before happen?") and the content ("what do we say?")
 * editable independently, and means a bride who moves her wedding simply gets a
 * fresh event rather than needing the journey re-run by hand.
 */

/** Consent → SMS if subscribed, else email. The shape most of these share. */
function preferredChannelNodes(args: {
  smsTemplate: string;
  smsKey: string;
  smsBody: string;
  emailTemplate: string;
  emailKey: string;
  emailSubject: string;
  emailBody: string;
  exitReason: string;
}): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  return {
    nodes: [
      {
        id: "n_consent",
        kind: "consent_check",
        label: "Contactable?",
        position: { x: 400, y: 150 },
        config: { channel: "any", purpose: "Client care" },
      },
      {
        id: "n_prefers_sms",
        kind: "condition",
        label: "SMS opted in?",
        position: { x: 400, y: 300 },
        config: { field: "profile.smsConsent", operator: "equals", value: "subscribed" },
      },
      {
        id: "n_sms",
        kind: "send_email",
        label: "SMS · " + args.smsTemplate,
        position: { x: 170, y: 460 },
        config: {
          template: args.smsTemplate,
          messageKey: args.smsKey,
          senderName: "Studio",
          subject: "SMS",
          body: args.smsBody,
        },
      },
      {
        id: "n_email",
        kind: "send_email",
        label: "Email · " + args.emailTemplate,
        position: { x: 640, y: 460 },
        config: {
          template: args.emailTemplate,
          messageKey: args.emailKey,
          senderName: "Studio",
          subject: args.emailSubject,
          body: args.emailBody,
        },
      },
      {
        id: "n_exit",
        kind: "exit",
        label: "Exit",
        position: { x: 400, y: 630 },
        config: { reason: args.exitReason },
      },
    ],
    edges: [
      { id: "e_trigger_consent", source: "n_trigger", target: "n_consent", sourceHandle: "out" },
      {
        id: "e_consent_cond",
        source: "n_consent",
        target: "n_prefers_sms",
        sourceHandle: "pass",
        label: "PASS",
      },
      {
        id: "e_consent_exit",
        source: "n_consent",
        target: "n_exit",
        sourceHandle: "fail",
        label: "FAIL",
      },
      {
        id: "e_cond_sms",
        source: "n_prefers_sms",
        target: "n_sms",
        sourceHandle: "true",
        label: "TRUE",
      },
      {
        id: "e_cond_email",
        source: "n_prefers_sms",
        target: "n_email",
        sourceHandle: "false",
        label: "FALSE",
      },
      { id: "e_sms_exit", source: "n_sms", target: "n_exit", sourceHandle: "out" },
      { id: "e_email_exit", source: "n_email", target: "n_exit", sourceHandle: "out" },
    ],
  };
}

export function seedJourneys(now: Date): JourneyDefinition[] {
  const created = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const updated = new Date(now.getTime() - 5 * 86_400_000).toISOString();

  /* ---------------------------------------------------------------- 1 ---- */
  const bookingConfirmation: JourneyDefinition = {
    id: "journey_booking_confirmation",
    key: "booking-confirmation",
    name: "Booking confirmation",
    description:
      "Welcomes a new client the moment their booking is confirmed, and confirms the details back to them in writing.",
    version: 2,
    status: "published",
    tags: ["Lifecycle", "Priority 1"],
    trigger: {
      type: "event",
      name: "booking.confirmed",
      description: "A booking has been confirmed and the deposit paid",
    },
    createdAt: created,
    updatedAt: updated,
    nodes: [
      {
        id: "n_trigger",
        kind: "event_trigger",
        label: "Booking Confirmed",
        position: { x: 400, y: 0 },
        config: {
          eventName: "booking.confirmed",
          description: "Fires when a booking is confirmed — from the website form or manually.",
        },
      },
      {
        id: "n_consent",
        kind: "consent_check",
        label: "Contactable?",
        position: { x: 400, y: 150 },
        config: { channel: "any", purpose: "Client care" },
      },
      {
        id: "n_email",
        kind: "send_email",
        label: "Email · Booking confirmation",
        position: { x: 400, y: 300 },
        config: {
          template: "booking-confirmation",
          messageKey: "booking-confirmation",
          senderName: "Studio",
          subject: "You're booked in, {{profile.firstName}}",
          body: "Hi {{profile.firstName}}, lovely to have you booked in for {{profile.weddingDate}} at {{profile.venue}}. You've booked {{profile.serviceBooked}}. I'll be in touch nearer the time with everything you need — and if anything changes, just reply to this email.",
        },
      },
      {
        id: "n_wait_trial",
        kind: "wait",
        label: "Wait 3 days",
        position: { x: 400, y: 460 },
        config: { duration: 3, unit: "days" },
      },
      {
        id: "n_trial_done",
        kind: "condition",
        label: "Trial booked?",
        position: { x: 400, y: 600 },
        config: { field: "profile.trialCompleted", operator: "equals", value: "true" },
      },
      {
        id: "n_trial_nudge",
        kind: "send_email",
        label: "Email · Book your trial",
        position: { x: 650, y: 760 },
        config: {
          template: "trial-nudge",
          messageKey: "trial-nudge",
          senderName: "Studio",
          subject: "Shall we get your trial booked, {{profile.firstName}}?",
          body: "Hi {{profile.firstName}}, most brides do their trial three to four months before the day. Reply with a couple of dates that suit and I'll get you in the diary.",
        },
      },
      {
        id: "n_exit",
        kind: "exit",
        label: "Exit",
        position: { x: 400, y: 920 },
        config: { reason: "Confirmation sent" },
      },
    ],
    edges: [
      { id: "e1", source: "n_trigger", target: "n_consent", sourceHandle: "out" },
      { id: "e2", source: "n_consent", target: "n_email", sourceHandle: "pass", label: "PASS" },
      { id: "e3", source: "n_consent", target: "n_exit", sourceHandle: "fail", label: "FAIL" },
      { id: "e4", source: "n_email", target: "n_wait_trial", sourceHandle: "out" },
      { id: "e5", source: "n_wait_trial", target: "n_trial_done", sourceHandle: "out" },
      { id: "e6", source: "n_trial_done", target: "n_exit", sourceHandle: "true", label: "TRUE" },
      {
        id: "e7",
        source: "n_trial_done",
        target: "n_trial_nudge",
        sourceHandle: "false",
        label: "FALSE",
      },
      { id: "e8", source: "n_trial_nudge", target: "n_exit", sourceHandle: "out" },
    ],
  };

  /* ---------------------------------------------------------------- 2 ---- */
  const threeMonths = preferredChannelNodes({
    smsTemplate: "prep-3-months-sms",
    smsKey: "countdown-3m",
    smsBody:
      "Hi {{profile.firstName}}, 3 months to go until {{profile.weddingDate}}! Now's the time to start your skincare prep — no new treatments within 4 weeks of the day. Full guide in your email.",
    emailTemplate: "prep-3-months-email",
    emailKey: "countdown-3m",
    emailSubject: "Three months to go — your skin prep guide",
    emailBody:
      "Hi {{profile.firstName}}, with {{event.daysUntil}} days until {{profile.venue}}, this is the ideal moment to start prepping. Facials are great now, but nothing new within four weeks of the day. Here's what I'd suggest week by week.",
    exitReason: "Three-month prep sent",
  });

  const countdown3m: JourneyDefinition = {
    id: "journey_countdown_3m",
    key: "countdown-3-months",
    name: "Three months to go",
    description:
      "Skincare prep guidance, sent by SMS where the client has opted in and by email otherwise.",
    version: 1,
    status: "published",
    tags: ["Countdown", "Priority 2"],
    trigger: {
      type: "event",
      name: "wedding.countdown.3months",
      description: "Emitted by the 'Three months to go' scheduled trigger",
    },
    createdAt: created,
    updatedAt: updated,
    nodes: [
      {
        id: "n_trigger",
        kind: "event_trigger",
        label: "3 Months To Go",
        position: { x: 400, y: 0 },
        config: {
          eventName: "wedding.countdown.3months",
          description: "Emitted by a scheduled trigger, not by date logic in this journey.",
        },
      },
      ...threeMonths.nodes,
    ],
    edges: threeMonths.edges,
  };

  /* ---------------------------------------------------------------- 3 ---- */
  const oneWeek = preferredChannelNodes({
    smsTemplate: "final-details-sms",
    smsKey: "countdown-1w",
    smsBody:
      "Hi {{profile.firstName}}, one week to go! I'll arrive at {{profile.venue}} for a {{profile.readyByTime}} finish. Have a clean, moisturised face ready and hair dry. Any questions, just text.",
    emailTemplate: "final-details-email",
    emailKey: "countdown-1w",
    emailSubject: "One week to go — final details",
    emailBody:
      "Hi {{profile.firstName}}, we're nearly there. Timings: ready by {{profile.readyByTime}} at {{profile.venue}}. Please come with a clean, moisturised face and dry hair, and have your veil to hand. Anything at all, just reply.",
    exitReason: "Final details sent",
  });

  const countdown1w: JourneyDefinition = {
    id: "journey_countdown_1w",
    key: "countdown-1-week",
    name: "One week to go",
    description: "Timings, location and what to have ready on the morning.",
    version: 1,
    status: "published",
    tags: ["Countdown", "Priority 3"],
    trigger: {
      type: "event",
      name: "wedding.countdown.1week",
      description: "Emitted by the 'One week to go' scheduled trigger",
    },
    createdAt: created,
    updatedAt: updated,
    nodes: [
      {
        id: "n_trigger",
        kind: "event_trigger",
        label: "1 Week To Go",
        position: { x: 400, y: 0 },
        config: {
          eventName: "wedding.countdown.1week",
          description: "Emitted by a scheduled trigger.",
        },
      },
      ...oneWeek.nodes,
    ],
    edges: oneWeek.edges,
  };

  /* ---------------------------------------------------------------- 4 ---- */
  const nightBefore: JourneyDefinition = {
    id: "journey_night_before",
    key: "night-before",
    name: "Night before",
    description:
      "A short, warm message the evening before. SMS only — an email the night before a wedding will not be read.",
    version: 1,
    status: "published",
    tags: ["Countdown", "Priority 4"],
    trigger: {
      type: "event",
      name: "wedding.countdown.nightbefore",
      description: "Emitted by the 'Night before' scheduled trigger",
    },
    createdAt: created,
    updatedAt: updated,
    nodes: [
      {
        id: "n_trigger",
        kind: "event_trigger",
        label: "Night Before",
        position: { x: 400, y: 0 },
        config: {
          eventName: "wedding.countdown.nightbefore",
          description: "Emitted by a scheduled trigger.",
        },
      },
      {
        id: "n_consent",
        kind: "consent_check",
        label: "SMS consent",
        position: { x: 400, y: 160 },
        config: { channel: "sms", purpose: "Client care" },
      },
      {
        id: "n_sms",
        kind: "send_email",
        label: "SMS · Night before",
        position: { x: 400, y: 320 },
        config: {
          template: "night-before-sms",
          messageKey: "countdown-night-before",
          senderName: "Studio",
          subject: "SMS",
          body: "Hi {{profile.firstName}}, all set for tomorrow! I'll see you at {{profile.venue}} — ready by {{profile.readyByTime}}. Get a good night's sleep and drink plenty of water. Can't wait!",
        },
      },
      {
        id: "n_exit",
        kind: "exit",
        label: "Exit",
        position: { x: 400, y: 480 },
        config: { reason: "Night-before message sent" },
      },
    ],
    edges: [
      { id: "e1", source: "n_trigger", target: "n_consent", sourceHandle: "out" },
      { id: "e2", source: "n_consent", target: "n_sms", sourceHandle: "pass", label: "PASS" },
      { id: "e3", source: "n_consent", target: "n_exit", sourceHandle: "fail", label: "FAIL" },
      { id: "e4", source: "n_sms", target: "n_exit", sourceHandle: "out" },
    ],
  };

  /* ---------------------------------------------------------------- 5 ---- */
  const feedback: JourneyDefinition = {
    id: "journey_feedback",
    key: "post-wedding-feedback",
    name: "Feedback request",
    description:
      "Six weeks after the wedding, once the photographs are back. Asks for a review, and only asks for a referral if the client engaged.",
    version: 1,
    status: "published",
    tags: ["Post-wedding", "Priority 5"],
    trigger: {
      type: "event",
      name: "wedding.feedback.due",
      description: "Emitted by the 'Feedback request' scheduled trigger",
    },
    createdAt: created,
    updatedAt: updated,
    nodes: [
      {
        id: "n_trigger",
        kind: "event_trigger",
        label: "6 Weeks After",
        position: { x: 400, y: 0 },
        config: {
          eventName: "wedding.feedback.due",
          description: "Emitted by a scheduled trigger.",
        },
      },
      {
        id: "n_consent",
        kind: "consent_check",
        label: "Contactable?",
        position: { x: 400, y: 150 },
        config: { channel: "email", purpose: "Marketing" },
      },
      {
        id: "n_cap",
        kind: "frequency_check",
        label: "Contact cap",
        position: { x: 400, y: 300 },
        config: { mode: "governed", channel: "email", maxMessages: 2, windowDays: 7 },
      },
      {
        id: "n_email",
        kind: "send_email",
        label: "Email · How was it?",
        position: { x: 400, y: 460 },
        config: {
          template: "feedback-request",
          messageKey: "feedback-request",
          senderName: "Studio",
          subject: "How was your day, {{profile.firstName}}?",
          body: "Hi {{profile.firstName}}, I hope {{profile.venue}} was everything you wanted. If you have two minutes, I'd be so grateful for a short review — it genuinely makes all the difference to a small business. And if you'd like your photos featured, just say the word.",
        },
      },
      {
        id: "n_wait",
        kind: "wait",
        label: "Wait 10 days",
        position: { x: 400, y: 620 },
        config: { duration: 10, unit: "days" },
      },
      {
        id: "n_referral",
        kind: "send_email",
        label: "Email · Refer a friend",
        position: { x: 400, y: 760 },
        config: {
          template: "referral-offer",
          messageKey: "referral-offer",
          senderName: "Studio",
          subject: "Know someone getting married?",
          body: "Hi {{profile.firstName}}, if you know anyone still looking for a makeup artist, send them my way — they'll get £25 off, and so will you on any future booking.",
        },
      },
      {
        id: "n_exit",
        kind: "exit",
        label: "Exit",
        position: { x: 400, y: 920 },
        config: { reason: "Feedback sequence complete" },
      },
    ],
    edges: [
      { id: "e1", source: "n_trigger", target: "n_consent", sourceHandle: "out" },
      { id: "e2", source: "n_consent", target: "n_cap", sourceHandle: "pass", label: "PASS" },
      { id: "e3", source: "n_consent", target: "n_exit", sourceHandle: "fail", label: "FAIL" },
      { id: "e4", source: "n_cap", target: "n_email", sourceHandle: "pass", label: "PASS" },
      { id: "e5", source: "n_cap", target: "n_exit", sourceHandle: "blocked", label: "BLOCKED" },
      { id: "e6", source: "n_email", target: "n_wait", sourceHandle: "out" },
      { id: "e7", source: "n_wait", target: "n_referral", sourceHandle: "out" },
      { id: "e8", source: "n_referral", target: "n_exit", sourceHandle: "out" },
    ],
  };

  return [bookingConfirmation, countdown3m, countdown1w, nightBefore, feedback];
}

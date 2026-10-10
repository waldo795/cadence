import type { EmailBlock } from "@/domain/email-content";
import type { EmailTemplate } from "@/domain/email-template";

/**
 * Starter templates for a bridal makeup business.
 *
 * Real copy rather than lorem ipsum, and every merge field is one that
 * actually exists on a client record — `weddingDate`, `venue`, `readyByTime`,
 * `partySize`, `serviceBooked`. A starter set written against invented fields
 * would be worse than none: it would look finished and produce braces in
 * somebody's inbox.
 *
 * Written in Annie's voice as the existing journeys have it — warm, direct,
 * and short. They are a starting point, not finished copy; she should edit
 * them.
 */

let counter = 0;
const id = () => `blk_seed_${(counter += 1)}`;

const heading = (text: string, level: 1 | 2 = 1): EmailBlock => ({
  id: id(),
  kind: "heading",
  level,
  text,
});

const text = (value: string): EmailBlock => ({ id: id(), kind: "text", text: value });
const divider = (): EmailBlock => ({ id: id(), kind: "divider" });
const space = (size: "small" | "medium" | "large" = "medium"): EmailBlock => ({
  id: id(),
  kind: "spacer",
  size,
});
const button = (label: string, href: string): EmailBlock => ({
  id: id(),
  kind: "button",
  label,
  href,
});
const columns = (widths: number[], cols: EmailBlock[][]): EmailBlock => ({
  id: id(),
  kind: "columns",
  widths,
  columns: cols,
});

const SITE = "https://makeupbyanniedaniel.co.uk";
const BOOKING = "https://book.makeupbyanniedaniel.co.uk";

function template(
  name: string,
  description: string,
  subject: string,
  preheader: string,
  blocks: EmailBlock[],
): EmailTemplate {
  const now = new Date().toISOString();
  return {
    id: `tpl_starter_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    description,
    subject,
    preheader,
    blocks,
    createdAt: now,
    updatedAt: now,
  };
}

export const STARTER_EMAIL_TEMPLATES: EmailTemplate[] = [
  /* ------------------------------------------------------------------ */
  template(
    "Booking confirmed",
    "Sent the moment a booking is confirmed. Warm welcome plus the details in writing.",
    "Your booking is confirmed, {{profile.firstName}}",
    "Everything we have agreed, in writing.",
    [
      heading("You are booked in"),
      text(
        "{{profile.firstName}}, I am so pleased to be part of your day. Here is everything we have agreed, so you have it in writing.",
      ),
      space("small"),
      // Two columns, because a date and a place are read at a glance rather
      // than in a sentence.
      columns(
        [1, 1],
        [
          [heading("Date", 2), text("{{profile.weddingDate}}")],
          [heading("Venue", 2), text("{{profile.venue}}")],
        ],
      ),
      columns(
        [1, 1],
        [
          [heading("Service", 2), text("{{profile.serviceBooked}}")],
          [heading("In the chair", 2), text("{{profile.partySize}}")],
        ],
      ),
      divider(),
      heading("What happens next", 2),
      text(
        "I will be in touch about three months before with skin prep advice, then again the week before to confirm timings. If anything changes in the meantime, just reply to this email — it comes straight to me.",
      ),
      space("small"),
      button("See your booking", BOOKING),
      space("small"),
      text("Annie"),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "Three months to go",
    "Skin prep guidance, sent far enough ahead to be useful.",
    "Three months to go — let's talk about your skin",
    "A few small things now make a real difference on the day.",
    [
      heading("Three months to go"),
      text(
        "{{profile.firstName}}, your wedding is on {{profile.weddingDate}} — which means now is the moment to start thinking about your skin. A few small things from here make a real difference on the day.",
      ),
      space("small"),
      heading("Start now", 2),
      text(
        "Drink more water than feels necessary. Get into a simple routine and stay with it — consistency beats expensive. If you are considering facials, book the last one no later than three weeks before.",
      ),
      heading("Leave well alone", 2),
      text(
        "No new active ingredients, no first-time treatments, and nothing you have not tried before. The week of a wedding is the wrong time to find out how your skin reacts to something.",
      ),
      divider(),
      heading("Thinking about a trial?", 2),
      text(
        "If we have not booked one yet, now is a good time. It is far easier to get right with months in hand than weeks.",
      ),
      button("Book a trial", BOOKING),
      space("small"),
      text("Any questions at all, just reply.\n\nAnnie"),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "One week to go",
    "Timings and final details. The one email that has to be unambiguous.",
    "One week to go, {{profile.firstName}}",
    "Timings, location, and what to have ready.",
    [
      heading("One week to go"),
      text("Everything you need for the morning is below. Please do read it through."),
      space("small"),
      columns(
        [1, 1],
        [
          [heading("I arrive", 2), text("{{profile.readyByTime}}")],
          [heading("Where", 2), text("{{profile.venue}}")],
        ],
      ),
      divider(),
      heading("Please have ready", 2),
      text(
        "A clean, moisturised face and dry hair. A chair by the best window in the room. Your veil and any hair pieces to hand. Something to eat — the morning goes quickly.",
      ),
      heading("One ask", 2),
      text(
        "Please do not try anything new on your skin this week. No new products, no facials, no threading or waxing within three days.",
      ),
      space("small"),
      text(
        "If anything about the timings has changed, reply to this email today rather than on the morning.\n\nSee you very soon.\n\nAnnie",
      ),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "Night before",
    "Short, warm, and reassuring. Nothing to action.",
    "See you in the morning, {{profile.firstName}}",
    "Nothing to do — just a note before the day.",
    [
      heading("See you in the morning"),
      text(
        "{{profile.firstName}}, everything is ready at my end. I will be with you at {{profile.venue}} as planned.",
      ),
      text(
        "Nothing to do tonight except get some sleep. Lay out what you need, put your phone somewhere else, and leave the rest to the morning.",
      ),
      space("small"),
      text("It is going to be a wonderful day.\n\nAnnie"),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "Feedback request",
    "Six weeks after, once the photographs are back. Asks for a review.",
    "How was your day, {{profile.firstName}}?",
    "I would love to hear how it went.",
    [
      heading("How was it?"),
      text(
        "{{profile.firstName}}, your photographs should be back by now — and I would genuinely love to hear how the day went.",
      ),
      text(
        "If you have two minutes, a review helps more than you might think. It is how most brides find me.",
      ),
      space("small"),
      button("Leave a review", `${SITE}/reviews`),
      space("small"),
      divider(),
      text(
        "And if anything was not quite right, I would rather hear it from you than read it later. Just reply.\n\nAnnie",
      ),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "Occasion makeup offer",
    "Post-wedding cross-sell. The lightest touch of the set.",
    "Something coming up, {{profile.firstName}}?",
    "Parties, christenings, anniversaries — not just weddings.",
    [
      heading("Not just weddings"),
      text(
        "{{profile.firstName}}, it was lovely doing your makeup for your wedding. A few brides have asked since whether I do anything else — so, in case it is useful: yes.",
      ),
      space("small"),
      columns(
        [1, 1],
        [
          [
            heading("Occasions", 2),
            text("Parties, christenings, anniversaries, work events, race days."),
          ],
          [
            heading("Lessons", 2),
            text("An hour on your own face, with your own products, doing it yourself."),
          ],
        ],
      ),
      space("small"),
      button("See what's available", `${SITE}/occasion`),
      divider(),
      text(
        "No need to reply if it is not relevant — and if you would rather not hear from me about this sort of thing, the unsubscribe link below only stops these, not anything about a booking.\n\nAnnie",
      ),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "Refer a friend",
    "Referral programme. Sent to brides who were happy, not to everyone.",
    "Know someone getting married?",
    "A thank you for sending someone my way.",
    [
      heading("Know someone getting married?"),
      text(
        "{{profile.firstName}}, almost everyone who books me was told about me by someone else — so if a friend is planning a wedding, I would be very grateful for the introduction.",
      ),
      space("small"),
      heading("How it works", 2),
      text(
        "Ask them to mention your name when they enquire. If they book, you both get £25 off — them from their balance, you as a credit against anything else you book with me.",
      ),
      space("small"),
      button("Send them here", BOOKING),
      space("small"),
      text("Thank you — genuinely.\n\nAnnie"),
    ],
  ),

  /* ------------------------------------------------------------------ */
  template(
    "Trial reminder",
    "For brides who have booked but not yet had a trial. Nudge, not nag.",
    "Shall we get your trial booked, {{profile.firstName}}?",
    "Easier to get right with months in hand than weeks.",
    [
      heading("Shall we get your trial in?"),
      text(
        "{{profile.firstName}}, your wedding is on {{profile.weddingDate}} and we have not got a trial in the diary yet.",
      ),
      text(
        "There is no rush today, but trials get harder to place as the date gets closer — and it is much easier to get the look right with months in hand than with weeks.",
      ),
      space("small"),
      button("Find a date", BOOKING),
      space("small"),
      text(
        "If you would rather skip the trial entirely, that is completely fine — just reply and I will take it off my list.\n\nAnnie",
      ),
    ],
  ),
];

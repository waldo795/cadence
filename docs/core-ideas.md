# Core ideas

Five concepts. Everything else in the product is built from them, and most of the design
decisions make sense once these do.

```
Client  ──►  Event  ──►  Journey  ──►  Instance  ──►  Message
             ▲
             └── Countdown trigger (fires on a date)
```

## 1. A client

A person, with attributes (`weddingDate`, `venue`, `bookingStatus`), consent per channel, and
tags.

Consent is per channel and recorded exactly as given. Nothing is ever sent to someone who has
not opted in, and the journey checks again at the moment of sending rather than trusting a
decision made earlier.

See [Clients](clients.md).

## 2. An event

Something that happened, at a moment in time, to a client. `booking.confirmed`,
`enquiry.submitted`, `wedding.countdown.3months`.

Events are the only way anything starts. They come from three places — the website form, the
app, or a countdown trigger — and once recorded they are indistinguishable. A journey cannot
tell whether its event came from a webhook or a scheduled rule.

> **Why it works this way**
> It means the same journey can be started by a real booking, a date arriving, or you
> manually replaying something for a test. If journeys were started directly by each of those
> sources instead, you would need three code paths and three sets of bugs.

## 3. A journey

A flowchart of what to do when an event arrives: check consent, branch on a condition, wait,
send something, exit.

A journey is a *definition*. It describes what should happen; it does not itself happen.

See [Journeys](journeys.md).

## 4. An instance

One client's actual progress through one journey. "Sophie is in Booking confirmation, parked
at the trial check, resuming on 12 October."

This is the difference between a design and a live system. The journey says "wait three
days"; the instance is the thing that remembers *whose* three days, *which* three days, and
where to pick up afterwards.

See [Journey instances](journey-instances.md).

## 5. A countdown trigger

A rule that watches a date on the client and fires when it arrives: "three months before the
wedding date".

Crucially, a trigger does **not** run a journey. It emits an event, and a journey listens for
that event.

> **Why it works this way**
> It separates *when* from *what*. Moving the reminder from three months to four is a change
> to the trigger alone — the journey that sends the message is untouched. The same event can
> also start more than one journey, be replayed, or later come from a real booking system
> instead of a date rule.

See [Countdown triggers](countdown-triggers.md).

---

## How they fit together

A worked example — the three-month skincare reminder:

1. Sophie is a **client** with `weddingDate` three months and one day from now, and
   `bookingStatus: confirmed`.
2. The scheduler runs. The **countdown trigger** "Three months to go" sees her date is now
   within range, emits the **event** `wedding.countdown.3months` carrying her venue and days
   remaining, and tags her `countdown-3m`.
3. The **journey** "Three months to go" is listening for that event. An **instance** is
   created for Sophie.
4. The instance runs: consent is checked, her SMS opt-in is confirmed, and a **message** is
   produced with her name and venue filled in.
5. The instance finishes. If the journey had contained a wait, it would instead have paused
   and resumed later.

Nothing about step 4 knows that step 2 involved a date. That is the point.

## Two surfaces, one engine

The canvas, the node library and the JSON view are for whoever builds the journeys.

Day-to-day use — seeing what is going out, editing wording, pausing things — should not
require any of that. Where a capability has both a builder view and a plain one, the guides
say which is which.

## Nothing is sent yet

Every "send" in the product today is **simulated**: the decision is real, the audit trail is
real, the message is rendered with the client's actual details — but nothing leaves the
building. Connecting a real email and SMS provider is still to come.

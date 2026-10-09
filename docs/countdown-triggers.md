# Countdown triggers

A countdown trigger watches a date on the client and fires when it arrives. "Three months
before the wedding." "The night before." "Six weeks after."

Find them under **Triggers**.

## What a trigger does

When a trigger comes due for a client, two things happen:

1. **It emits an event** with a payload you configure.
2. **It tags the client**, if you set a tag.

It does not send anything. A journey listening for that event does the sending.

> **Why it works this way**
> It separates *when* from *what*. Changing the three-month reminder to four months is a
> change to the trigger; the message is untouched. Rewriting the message is a change to the
> journey; the schedule is untouched.
>
> The tag and the event answer different questions, which is why you get both. The tag says
> *who someone is* — "in the three-month window" — and is useful for filtering. The event says
> *when something happened*, and is what actually starts things. Most tools make you choose.

## Setting one up

| Field | What it means |
| --- | --- |
| **Anchor date field** | The date to count from, e.g. `profile.weddingDate` |
| **Offset** | How far before (negative) or after (positive) |
| **Only when** | Extra conditions the client must meet |
| **Event name** | What gets emitted, e.g. `wedding.countdown.3months` |
| **Tag** | Optional label applied to the client |
| **Payload** | Key/value pairs carried on the event |
| **Catch-up window** | How late is still acceptable — see below |

### Payload placeholders

Payload values can pull in data:

| Placeholder | Gives you |
| --- | --- |
| `{{profile.venue}}` | Any client field |
| `{{trigger.anchorDateShort}}` | The anchor date, `YYYY-MM-DD` |
| `{{trigger.daysUntilAnchor}}` | Days remaining |
| `{{trigger.firedAt}}` | When it fired |

Putting the venue and days-remaining on the event spares every downstream journey from
recalculating them.

## The two safety rules

These are the parts most likely to surprise you, and both exist because the alternative
causes real harm.

### Fired once per client per date

The record of what has fired is keyed on **trigger + client + anchor date**. Running the
scheduler repeatedly will not send a bride her three-month reminder twice.

But if she **moves her wedding**, the anchor date changes, the key changes, and the countdown
correctly fires again against the new date.

> **Why it works this way**
> A simple "already sent" flag would get the second half wrong. Someone who moves their
> wedding from June to September genuinely should receive the three-month reminder again —
> three months before the *new* date.

### A catch-up window stops retroactive sends

Each trigger declares how far in the past a fire time may be and still fire.

Without it, adding a client whose wedding was last year would immediately text them *"three
months to go!"* — about a wedding that already happened.

| Trigger | Window | Why |
| --- | --- | --- |
| Three months to go | 3 days | Not time-critical |
| One week to go | 2 days | Mildly time-critical |
| Night before | 1 day | Useless if late |
| Feedback request | 14 days | Not time-sensitive at all |

Anything older is marked **Missed** and never sent.

> **Why it works this way**
> It is the difference between a scheduler that survives an outage and one that rewrites
> history. A few hours down should catch up; a client imported with an old date should not
> trigger a flood.

## Reading the schedule panel

| Status | Meaning |
| --- | --- |
| **Due now** | Will fire on the next run |
| **Scheduled** | Will fire on the date shown |
| **Already sent** | Fired for this client and this date |
| **Missed** | Was due, but beyond the catch-up window |
| **Not eligible** | Fails a condition — typically not a confirmed booking |
| **No date** | No anchor date on this client |
| **Off** | The trigger is switched off |

## Running them

**Run due triggers** on the Triggers page fires everything currently due. Press it twice and
nothing happens the second time — that is the de-duplication working.

In production the scheduler does this automatically. See
[Journey instances](journey-instances.md#the-scheduler).

## The seeded triggers

| Trigger | When | Emits |
| --- | --- | --- |
| Three months to go | −3 months | `wedding.countdown.3months` |
| One week to go | −7 days | `wedding.countdown.1week` |
| Night before | −1 day | `wedding.countdown.nightbefore` |
| Feedback request | +6 weeks | `wedding.feedback.due` |

All four require `bookingStatus = confirmed`, so website enquiries do not get countdown
messages before they have actually booked.

## Watch out

- **Enquiries are excluded by design.** Nobody gets "three months to go" until the booking is
  confirmed. Change the condition if you want otherwise.
- **A client with no wedding date is skipped**, not errored. Occasion clients simply have no
  anchor.
- **Changing the event name breaks the link** to any journey listening for the old one. The
  journey will stop receiving anything, silently.
- **Month arithmetic clamps.** "31 March minus one month" becomes 28 February, not 3 March.

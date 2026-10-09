# Sending email

Everything between a journey deciding to send something and a message arriving
in someone's inbox.

Three separate controls stand in the way, and they are checked in this order:

1. **The kill switch** — workspace-wide, stops everything, instantly.
2. **The journey's send mode** — off, test or live, set per journey.
3. **The usual policy** — consent, frequency caps, suppression, control groups.

A message goes out only if it survives all three.

---

## Send modes

Every journey is in one of three modes. You set it from the journeys list:
**… → Sending…**

| Mode | What happens |
| --- | --- |
| **Not sending** | The journey runs normally and records every message it decided to send. Nothing is handed to the email provider. |
| **Test mode** | Messages are really sent, but to a test address instead of the client. The client's real address is put in the subject line. |
| **Live** | Messages go to the client. |

**A journey you have never configured is "Not sending".** That is deliberate:
building a journey should never start emailing people because nobody
remembered to turn it off.

> **Why it works this way**
>
> Send mode is not stored on the journey itself. Journeys are versioned, and
> somebody half-way through a three-month countdown is pinned to the version
> they entered on. If the mode lived on the journey, flipping it to live would
> only affect people who entered *afterwards* — everyone already in the
> countdown would quietly stay in test. The mode is stored against the
> journey's lineage instead, so a change applies to everybody at once. That is
> the only useful behaviour for both a go-live and a panic.

> **Watch out**
>
> Changing a journey to live affects people already in it, including anyone
> waiting at a Wait node. If you have been testing a countdown with real
> clients in it, they will get the *next* message in the sequence as a real
> one — not the ones they already missed.

---

## Test profiles

A test profile is just a name and an address that test sends are redirected
to. Manage them in **Settings → Test profiles**, or add one on the spot from
the sending dialog.

They are deliberately **not** clients. Keeping them in a separate list means a
test address can never be picked up by a segment, a countdown or an
experiment, and never counts toward anything.

A redirected email arrives with its subject rewritten:

```
[TEST → ava.mitchell@example.com] One week to go, Ava
```

so you can always tell whose message you are looking at.

**Send test** next to a test profile sends one diagnostic email immediately,
without involving a journey. Use it to confirm the provider is configured —
otherwise the only way to find out is to wait for a countdown and deduce the
problem from nothing arriving.

> **Watch out**
>
> Deleting a test profile sets any journey pointing at it back to **Not
> sending**, rather than leaving it in test mode with nowhere to send. A
> journey that looks armed and silently sends nothing is the one state worth
> engineering away.

---

## The kill switch

**Settings → Kill switch → Stop all sending.**

Stops every email from every journey at once. Journeys keep running, keep
making decisions and keep recording them — the messages simply do not leave.
Turning it off puts everything back exactly as it was.

While it is on you will see **"Sending disabled within org — killswitch
enabled"** across the top of every page, in the sidebar, on every journey in
the list, and inside the sending dialog. It is not dismissable.

> **Why it works this way**
>
> This is deliberately not the same as pausing journeys. Pausing stops new
> people entering but lets everyone already in flight carry on, and undoing it
> afterwards is fiddly and error-prone. The kill switch is the control you want
> at the moment you realise the copy is wrong — it changes nothing about the
> journeys themselves, so there is nothing to put back.

The kill switch also blocks the **Send test** button. "Stop all emails" has to
mean all of them, or the switch is a promise with an exception in it — and the
exception would be the one thing someone reaches for while trying to work out
what went wrong.

---

## What gets recorded

Every decision produces a message record, whether or not anything was sent.

| Status | Meaning |
| --- | --- |
| `sent` | Accepted by the provider, addressed to the client. |
| `test` | Accepted by the provider, redirected to a test address. |
| `blocked` | Decided but not sent — kill switch, or the journey is not sending. |
| `failed` | Handed to the provider and rejected. The reason is on the record. |
| `simulated` | A dry run, or a channel with no provider connected. |

Each record keeps `sentTo` (where it actually went), `providerId` (the
provider's own id, for chasing a delivery up with them) and `sendDetail` (why
it was blocked or redirected, in plain language).

> **Why it works this way**
>
> `test` does **not** count toward frequency caps or cross-journey exclusions.
> A redirected message never reached the client, so counting it would let a few
> test runs eat a real bride's weekly allowance and silently suppress the
> reminder she was supposed to get.

---

## Configuration

Set these on the host (Railway → the **cadence** service → Variables), not in
the repository.

| Variable | Notes |
| --- | --- |
| `RESEND_API_KEY` | Create at resend.com/api-keys with **sending access only**. Cadence never manages domains, keys or contacts. |
| `EMAIL_FROM` | Must be on a domain verified in Resend. |
| `EMAIL_REPLY_TO` | Optional. Set it if replies should reach a different inbox from the sending address — they usually should. |
| `APP_URL` | Where unsubscribe links point. Detected from Railway's own domain; set it explicitly behind a custom domain. **Without it, emails go out with no unsubscribe link**, which is unlawful for marketing. |

With no key set, nothing can be sent: journeys still decide and record, and
every message is marked `failed` with the reason.

**Before a domain is verified**, use Resend's sandbox sender:

```
EMAIL_FROM=Cadence <onboarding@resend.dev>
```

It needs no verification but only delivers to the address that owns the Resend
account. That is enough for test mode and not enough to go live.

---

## Duplicates

If the process dies after sending but before recording progress, the journey
resumes from where it was and offers the same messages again. Two things stop
that arriving twice:

- every send carries an idempotency key derived from the instance and step
  number, which the provider collapses for 24 hours;
- the message table ignores a repeated id.

Sending happens *before* progress is saved, on purpose. The other ordering
drops sends silently instead, which is the worse failure for a reminder that
cannot usefully be sent late.

---

## What is not here yet

- **An outbox.** A send that fails transiently is recorded as `failed` and not
  retried. Needed before real clients depend on this.
- **SMS.** The seeded "SMS" messages are email nodes labelled as SMS. There is
  no `send_sms` node kind and no SMS provider, so those are recorded, not sent.
- **Delivery and open tracking.** Resend reports these by webhook; nothing
  consumes it yet, so `sent` means "accepted by the provider", not "arrived".

See [README](README.md) for the rest of the documentation.

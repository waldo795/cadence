# Privacy requests

When a client asks for their data, or asks to be deleted, you have a legal duty to respond.
The **Privacy** page is where those requests are tracked and serviced.

This guide describes how the tool works. It is not legal advice.

## The rights you have to honour

| Right | What it means | Deadline |
| --- | --- | --- |
| **Access** | Give them everything you hold, in a readable form, free | One calendar month |
| **Erasure** | Delete their data, unless you have a legal reason to keep some | One calendar month |
| **Portability** | The data they gave you, machine-readable | One calendar month |
| **Rectification** | Correct anything wrong, and tell them you have | One calendar month |
| **Objection** | Stop marketing to them — **immediately**, no grace period | At once |

The deadline is **one calendar month from receipt**, not thirty days, and not from when you
start work. Log a request the day it arrives.

## Working a request

### 1. Log it

**Privacy → Log a request.** Pick the type, enter their email. The tool matches it against
your client list straight away, so you can see whether a record even exists.

### 2. Verify who they are

Nothing can be disclosed or deleted until you tick *I have verified their identity*. This is
enforced by the server, not just hidden in the interface.

> **Why it works this way**
> Anyone can send an email claiming to be someone else. Handing over a client's details, or
> deleting them, because an impostor asked is itself a breach — and worse than the one you
> were trying to avoid.
>
> For a small business, verifying usually means replying to the address on their booking, or
> asking something only they would know (their venue, their wedding date). Do not ask for a
> passport; that is more data, not less.

### 3. See what is held

**What is held?** shows a count per store. Worth doing even for an access request — it tells
you what you are about to hand over.

### 4. Do the thing

**Access or portability** → *Download their data*. Produces a JSON file containing
everything, with a plain-English explanation of what each section means. Send it securely.

**Erasure** → type their email to confirm, then *Erase permanently*.

## What erasure actually removes

Personal data lives in seven places, and all seven are swept:

| Store | What it holds |
| --- | --- |
| Client record | Name, email, phone, wedding date, venue, consent |
| Events | Enquiries, bookings, countdown events |
| Messages | Message bodies — these contain their name |
| Journey progress | Where they are in a sequence, plus the frozen event payload |
| Experiment ledger | Which variant they were in |
| Journey history | Past participation |
| Reminder history | Which reminders already fired for them |

> **Why that last one matters**
> Reminder history is stored as keys shaped `trigger:profileId:date` — the identifier is
> inside a string rather than in a field. A sweep written by looking at object properties
> walks straight past it, leaving an identifier behind after you have told someone their data
> is gone. It is the easiest one to get wrong, so it is explicitly covered.

### Erasure is verified, not assumed

After deleting, the tool re-counts every store. If anything remains it says so and leaves the
request **open** rather than marking it complete.

> **Why it works this way**
> The failure that matters is not erasure crashing — it is erasure quietly missing a store
> while reporting success, because then you tell the client it is done and it is not.

### What is deliberately kept

A **salted hash of their email**. Nothing else — no name, no readable address.

> **Why it works this way**
> If you deleted absolutely everything, you would also delete the record of them asking not
> to be contacted. Next time their address appeared on an import you would start messaging
> them again, which is the opposite of what they asked for. Keeping the minimum needed to
> honour the request is explicitly permitted.
>
> It is salted because the range of email addresses is small enough to brute-force an
> unsalted hash. `PRIVACY_SALT` should be set once and left alone — changing it breaks
> matching against entries already recorded.

## Watch out

- **Erasure cannot be undone.** There is no soft delete and no recycle bin. The preview and
  the typed confirmation are the only safety net.
- **Overdue requests are flagged in red.** Missing the one-month deadline is itself a breach.
  Respond even if only to explain a delay — the regulation allows an extension for complex
  requests, provided you tell them inside the month.
- **Objection has no grace period.** If someone says stop, stop now; do not wait a month.
- **A request with no matching client still needs an answer.** "We hold nothing about you" is
  a valid and complete response, and should be given in writing.

## What is not automated yet

Everything above is deliberately manual, because identity verification cannot be automated
safely for a business this size. What could be added later:

- **A self-service link** so a client can request their own export without emailing, with
  verification by a one-time link to the address already on file
- **Automatic erasure after a retention period** — for instance, deleting past clients two
  years after their wedding unless they re-book
- **Unsubscribe handling**, which is currently missing entirely and is required before any
  marketing message goes out

The erasure sweep is already a single function, so wiring it to a verified self-service link
later is a small change rather than a rewrite.

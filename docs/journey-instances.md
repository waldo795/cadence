# Journey instances

An **instance** is one client's progress through one journey. It is what turns a journey from
a drawing into something that actually happens to people over weeks.

## Why instances exist

A journey definition says "wait three days, then check whether they booked a trial". That
sentence describes a shape, not an event. Running it for a real client means something has to
remember, three days later and possibly after a server restart, that *Sophie* was waiting and
*where* she had got to.

That memory is the instance:

| Field | Meaning |
| --- | --- |
| `profileId` | Who |
| `journeyKey` / `journeyId` | Which journey, and which *version* of it |
| `currentNodeId` | Where to pick up |
| `status` | running, waiting, completed, exited, failed |
| `wakeAt` | When to look at them again |
| `context` | The event that started it, frozen |
| `assignment` | Their experiment variant, frozen |
| `stepCount` | Nodes traversed across every resumption |

## How a run actually proceeds

The runner advances an instance **as far as it can go**, then stops and saves.

```
Event arrives
   │
   ├─ create instance
   │
   ├─ advance: consent ✓ → send email → reach "Wait 3 days"
   │
   └─ SAVE: status=waiting, currentNodeId=<node after the wait>, wakeAt=+3 days
                              │
         ... three days pass, server may restart, deploy, sleep ...
                              │
   ┌──────────────────────────┘
   │
   ├─ scheduler finds it due
   ├─ advance: check trial → branch → Exit
   │
   └─ SAVE: status=exited, wakeAt=null
```

Each of those slices is durable. Nothing is held in memory between them.

> **Why it works this way**
> Resumption points at the node *after* the wait, not the wait itself. Once the clock reaches
> `wakeAt` the wait is finished — resuming onto it would re-arm the same three days, and the
> client would never move past it.

## One engine, two clocks

The runner and the simulator use **the same engine**. Two options differ:

| | Clock | Waits | Persists | Records messages |
| --- | --- | --- | --- | --- |
| Simulation | virtual | fast-forwards | no | no |
| Live run | real | suspends | yes | yes |

Everything else — conditions, consent, caps, exclusions, personalisation, experiment routing
— is literally the same code path.

> **Why it works this way**
> The classic failure of tools like this is the preview saying one thing and production doing
> another. If the two used separate implementations they would drift, and the drift would
> only ever be discovered by a customer receiving the wrong thing.

## Rules the runner enforces

**One live instance per client per journey.** A client already in a journey is not re-entered;
the event is recorded and skipped. Without this, a second booking confirmation would run a
duplicate countdown and send every remaining message twice.

This is enforced by a unique index in the database, not only in code — the website form and
the scheduler can both try to start one at the same instant.

**A finished journey can be re-entered.** The rule is about *concurrent* instances. Once
someone has completed or exited, a new event starts them again — which is what you want for
a client booking a second wedding party, or returning years later.

**The journey version is pinned at entry.** If you edit a journey while people are mid-flight,
they keep running the version they entered on.

> **Why it works this way**
> Otherwise an edit could delete the very node someone is parked at, and they would resume
> into nothing. Pinning means in-flight clients finish the experience they started, and your
> edit applies to everyone who enters from now on.

**The experiment variant is frozen at entry.** Changing an experiment's allocation cannot move
somebody who is already in flight.

**A loop guard across resumptions.** `stepCount` accumulates over the whole life of the
instance, not per slice, so a journey that loops is caught even if each individual slice looks
reasonable. Hitting the limit marks the instance `failed` rather than letting it run forever.

**One failure does not stop the others.** Each instance is advanced and saved independently.
A journey with a broken node fails that instance alone — everyone else's reminders still go
out.

## Statuses

| Status | Meaning |
| --- | --- |
| `running` | Mid-slice. Rarely seen; instances do not rest here. |
| `waiting` | Parked at a wait. `wakeAt` says when to resume. |
| `completed` | Reached the end of the path. |
| `exited` | Reached an Exit node, or was stopped by a gate such as consent. |
| `failed` | Something went wrong. `lastError` says what. |

## The scheduler

A single endpoint does both jobs, in this order:

1. Evaluate countdown triggers — anything due emits an event and tags the client.
2. Advance instances — new events start journeys, and anything whose `wakeAt` has passed
   resumes.

```bash
curl -X POST http://localhost:3000/api/cron
```

Add `?dryRun=true` to see what *would* happen without writing anything.

The order matters: emitting first means a countdown coming due on this tick starts its journey
on the same tick, rather than waiting for the next one.

**Daily is enough.** The countdowns work at day granularity, and a daily run at a civilised
hour also avoids texting anyone at 3am.

> **Watch out**
> There is no scheduler running yet. Until the app is hosted with a cron pointed at this
> endpoint, nothing advances unless you call it yourself.

### Protecting the endpoint

It sends messages to real people, so it is protected by a shared secret:

```bash
curl -X POST https://your-app/api/cron -H "Authorization: Bearer $CRON_SECRET"
```

With `CRON_SECRET` unset it works without a token in development, and **refuses to run at all
in production** — so a deployment cannot accidentally leave it open.

## Watch out

- **A wait with nothing after it ends the journey.** The instance completes rather than
  parking forever waiting to resume into nothing.
- **A "wait until" whose moment has already passed does not suspend.** It falls straight
  through and the journey continues. A backdated countdown catches up rather than stalling.
- **Resuming uses the clock at resumption, not the original event time.** Otherwise a "wait 24
  hours" placed after a three-month countdown would compute a wake time already in the past.
- **Messages are recorded, not sent.** Status `simulated`. Real delivery is still to come.

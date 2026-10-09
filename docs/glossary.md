# Glossary

Every term the product uses.

### Anchor date
The date a countdown trigger counts from — usually the client's wedding date.

### Attribute
A field on a client: `weddingDate`, `venue`, `partySize`, `bookingStatus`. Used in conditions
and in message personalisation.

### Attribution window
How long after being exposed to an experiment a conversion still counts toward it.

### Catch-up window
How late a countdown trigger may fire and still be acceptable. Past that it is **Missed**.
Stops a client with an old wedding date being told "three months to go". See
[Countdown triggers](countdown-triggers.md).

### Consent
Permission to contact someone, recorded per channel (email, SMS) and stored exactly as given.
Checked again at the moment of sending, never assumed.

### Contact cap
The most messages a client may receive in a period. Resolved per client from the workspace
policy. See [Contact governance](contact-governance.md).

### Control group / holdout
A slice of clients deliberately *not* sent something, so the effect of sending can be
measured against them.

### Conversion
The event an experiment counts as success — a review submitted, a booking confirmed.

### Event
Something that happened to a client at a moment in time. The only thing that starts a
journey. Sources: the website form, the app, or a countdown trigger.

### Exclusion check
A node that stops a journey if the client was already contacted by another journey recently.
Prevents two journeys both messaging someone the same week.

### Exit
A node ending the journey. Its reason shows in the client's history.

### Exposure
The record that a client entered an experiment. One per client per experiment — re-entry
increments a counter rather than adding a row, so the denominator counts people, not visits.

### Instance
One client's progress through one journey: where they are, when to resume. See
[Journey instances](journey-instances.md).

### Journey
A flowchart of what to do when an event arrives. A *definition* — it describes what should
happen rather than being the thing happening.

### Journey key (lineage key)
A journey's stable identity, unchanged across versions. Everything that refers to a journey
refers to the key, so rebuilding a journey does not break references to it.

### Lift
How much better a variant performed than the baseline, as a percentage.

### Message key
A message's stable identity, separate from its wording, so copy can be rewritten without
breaking exclusion rules that reference it.

### Node
One step on the canvas: a condition, a wait, a send, a check, an exit.

### Outbox
*Not built yet.* A queue of decided-but-not-yet-sent messages, giving retries, idempotency
and a list of what is about to go out.

### Payload
Data carried on an event. Readable in conditions and message copy as `{{event.something}}`.

### Scheduled trigger
See **countdown trigger**.

### Simulation
Running a journey against a named client to see exactly what they would receive, without
sending. Uses the same engine as the live path.

### Suppression (global)
A flag blocking *all* contact with a client regardless of consent. Set in the app only — the
website form cannot clear it.

### Tag
A label on a client, applied manually or by a trigger. Used for filtering.

### Tenant
A workspace. One today; every table carries the column so a second needs no migration.

### Variant
One arm of an experiment. Routes to the original journey, a fork, or a holdout.

### Virtual time
The simulator's fast-forwarded clock, letting a three-month journey preview instantly.

### Wait / Wait until
Nodes that pause a journey — for a duration, or until a date expression like
`event.weddingDate - 48 hours`. In a live run the instance suspends here; in simulation the
clock fast-forwards.

### wakeAt
When the scheduler should next look at a waiting instance.

# Cadence — Customer Journey Orchestration (local PoC)

A working proof of concept for a customer journey orchestration product, set up for a
**bridal makeup business**: capture a client, watch date-relative countdown rules fire as the
wedding approaches, and design the message each milestone sends.

```
Client + Wedding date → Scheduled trigger → Event → Journey → Decisions → Messages
```

> **All client data is fictional.** Every client, event and message in the seed was invented
> for the demo. No message is ever actually sent to anyone.

**[User guide →](docs/README.md)** — what each capability does and why it behaves that way.

---

## Read this first — what does and does not work

**Works today, on this machine**

- Adding clients through the sign-up page. They are written to **Postgres**, so they survive
  a refresh, a browser change, clearing site data and restarting the server.
- **The website enquiry endpoint** (`POST /api/intake`) — validated, spam-trapped, rate
  limited, and de-duplicating by email so nobody is entered twice.
- Countdown triggers evaluating every client and emitting events when a milestone arrives.
- Designing and simulating every journey, and seeing exactly what each client would receive.
- Consent captured per channel and enforced on every send.

**Does not work yet — and needs a backend, not more UI**

- **No public URL.** The intake endpoint is built and tested, but the app only runs on this
  machine, so a form on her website has nowhere to post to. Hosting is the only thing left
  for this one.
- **Nothing fires on a schedule yet.** The scheduler endpoint exists (`POST /api/cron`) and
  works; it just needs a hosted cron pointed at it.
- **Email can be sent; push and SMS cannot.** With `RESEND_API_KEY` and `EMAIL_FROM` set, a
  journey put into test or live mode really sends. Push and SMS have no provider and are
  recorded only. Every journey starts at "not sending", and a workspace kill switch stops
  everything at once — see [Sending email](docs/sending-email.md).

So this is a real tool for *designing and pressure-testing* the journeys, and a real client
list — but it cannot yet be fed by a public website, and nothing fires on a schedule until a
cron is pointed at it.

### What going live would need

| Gap | What it needs |
| --- | --- |
| Website form → client list | ~~A database~~ ~~an endpoint~~ (both done) — just hosting now |
| Countdown fires by itself | A scheduled job calling the same `runDueTriggers` evaluation |
| Messages actually send | An email provider (domain verification required) and an SMS provider |
| Unsubscribe links | A hosted preference page — legally required for marketing sends |

Persistence and intake are done. The remaining blocker for both the form and the scheduler is
the same thing: somewhere public to run.

---

## The website enquiry endpoint

`POST /api/intake` accepts both shapes a real form takes: a plain HTML `<form action>` post,
which arrives URL-encoded and redirects the visitor back to the site, and a `fetch()` post,
which arrives as JSON and gets JSON back. Supporting only the second would force her site to
run JavaScript for something that works fine without it.

The embeddable snippet is on the **Add client** page, ready to copy.

**What it does with an untrusted submission**

- **Validates and length-caps everything.** A wedding date more than five years out or two
  years past is rejected — almost always a typo or a bot, and letting one through would put
  a client on a countdown that fires wrongly or never.
- **De-duplicates by email.** A bride who enquires twice does not become two clients, which
  would otherwise put her on the countdown twice and send every reminder in duplicate.
- **Fails closed on consent.** A checkbox only appears in a form body when ticked; anything
  else is treated as *not* consented. A repeat submission overwrites consent with whatever
  was ticked that time, including withdrawing it — the form is the client's current stated
  preference, and quietly keeping an older, more permissive answer is what gets a business
  in trouble.
- **Never promotes an enquiry to a confirmed booking.** That happens when a deposit is taken,
  which this endpoint cannot know about — so website enquiries correctly stay out of the
  wedding countdown until the booking is confirmed in the app.
- **Never clears global suppression.** That is a decision made in the app, and a public
  endpoint must not be able to undo it.
- **Silently drops bots.** A hidden honeypot field that humans leave empty. A filled one gets
  a success response and is not stored — telling a bot it was rejected just teaches whoever
  wrote it which field to leave alone.
- **Rate limits** to five submissions per minute per IP.

**Before going live**, set `INTAKE_ALLOWED_ORIGINS` to her site's domains, comma-separated.
Unset means any origin may post, which is right for local development and wrong in
production.

The rate limiter is in-memory: it resets on restart and does not span instances. It exists to
stop a public form being trivially flooded, not to withstand a determined attacker — that
needs a shared store or a WAF in front.

---

## Running locally

Requires **Node.js 20 or newer**. No database to install: with no `DATABASE_URL` set the app
runs PGlite, which is Postgres itself compiled to WebAssembly, against `data/pg`.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

Other commands:

```bash
npm run build
```

```bash
npx tsc --noEmit
```

```bash
npx eslint .
```

---

## Try it in five minutes

1. **Triggers** — the four countdown rules, and which client each one fires for next.
2. Press **Run due triggers**. Four events are emitted and the matching clients are tagged.
   Press it again and nothing happens — each client is only counted once per wedding date.
3. **Journeys → Three months to go → Simulate** — pick Sophie and the
   `wedding.countdown.3months` event to see the exact message she would get.
4. **Add client** — add someone with a wedding date, then return to Triggers to see where
   they land in the schedule.

---

## The countdown model

A trigger does **not** run a journey. It watches a date on the client and, when the moment
arrives, emits an ordinary event with a configurable payload. Journeys listen for that event
exactly as they listen for any other.

```
profile.weddingDate − 3 months   →  emits wedding.countdown.3months
                                     payload: weddingDate, daysUntil, venue
                                     and tags the client "countdown-3m"
```

That indirection is the point. The journey has no idea dates are involved, so the schedule
("when is three months before?") and the content ("what do we say?") are edited independently.
Moving the reminder to four months is a change to the trigger alone. The same event can start
more than one journey, be replayed, or later arrive from a real booking system instead.

A trigger also tags the client, so "is in the three-month window" is queryable as a segment
*and* observable as an event — segment membership tells you who someone is, the event tells
you when something happened.

### Two safety properties worth knowing

**Fired once per client per wedding date.** The ledger key includes the anchor date, so
re-running the triggers will not send a bride her three-month reminder twice — but if she
moves her wedding, the key changes and the countdown correctly fires again for the new date.

**A catch-up window stops retroactive sends.** Without it, importing a client whose wedding
was last year would text them "three months to go!" today. Each trigger declares how far in
the past a fire time may be and still fire — one day for the night-before message, fourteen
for the feedback request. Anything older is marked *missed* rather than sent. This is the
difference between a scheduler that survives an outage and one that rewrites history.

---

## Seeded journeys, in priority order

| # | Journey | Started by |
| --- | --- | --- |
| 1 | Booking confirmation | `booking.confirmed` — from the sign-up form or entered by hand |
| 2 | Three months to go | `wedding.countdown.3months` — scheduled trigger |
| 3 | One week to go | `wedding.countdown.1week` — scheduled trigger |
| 4 | Night before | `wedding.countdown.nightbefore` — scheduled trigger |
| 5 | Feedback request | `wedding.feedback.due` — scheduled trigger, six weeks after |

Each countdown journey checks consent, then sends by SMS where the client opted in and email
otherwise. The night-before message is SMS only — an email the evening before a wedding will
not be read.

Priorities 6 (post-wedding upsell) and 7 (referral programme) are **not built as separate
journeys**. The feedback journey ends with a referral offer ten days after the review request,
which covers the most valuable part of both; a full occasion-makeup win-back is the natural
next build.

---

## Current capabilities

**Journey canvas** (`/journeys/:id`)
- Pan, zoom, fit-to-screen, minimap and zoom controls
- Drag components from the left library onto the canvas, or click to drop one
- Connect, select, duplicate and delete nodes; `Delete`/`Backspace` removes a selection
- Custom node components that show their configuration on the canvas — you can read a
  journey end to end without opening anything
- Fourteen node types across Entry, Logic, Action and Control
- Right-hand properties panel whose controls change per node type; edits apply immediately
- Live validation (errors and warnings) in the toolbar; publishing is blocked on errors
- Unsaved-changes indicator, Save (`Cmd`/`Ctrl+S`), draft/published state and version number

**Journey definition** (`View definition`)
- The full journey as formatted JSON, with copy and **Export JSON**
- **Import JSON** — parsed and validated before it is allowed to replace the open journey

**Simulation** (`Simulate`)
- Pick any seeded profile and triggering event, and edit the event payload as raw JSON
- Step / Continue / Restart through a timeline of every decision
- **Virtual time**: waits advance a simulated clock, so a 21-day journey resolves instantly
- Canvas visualisation: current node highlighted, traversed edges animated, untaken
  branches dimmed, and the outcome (`TRUE`, `PASS`, `BLOCKED`, `WAITING`, …) shown on each
  visited node
- Personalisation preview showing the template and the rendered result side by side
- Explicit policy decisions with the reason a message was allowed or blocked

**Experiments** (`/experiments`)
- Experiments are standalone records that **target a journey**, not settings inside one — a
  live experience is never edited, republished or interrupted to put it under test
- Pick the journey under test, then allocate variants. Each variant routes a profile to:
  - the **original journey** (the usual control),
  - a **fork** — a separate journey definition run instead, which is how you test a different
    experience, with one click to copy the live journey as an editable variant, or
  - a **holdout** — no experience at all, for incrementality
- At entry the journey asks "is an experiment live for me?" and routes accordingly. When a
  profile is forked or held out, the original journey still records an entry and an exit
  stamped *executed under &lt;experiment&gt;*, so its participation history stays complete
- Start, pause and conclude from the experiment; the journey definition never changes
- **Run whole cohort** in the builder pushes every seeded profile through twice and reports
  who ran the original, who was forked, who was held out, and whether assignment drifted

**Lift reporting** (on each experiment)
- Exposures are persisted — **one row per profile per experiment**. Re-entry increments a
  counter and never adds a row, so the denominator counts people rather than visits
- Conversions are attributed from the event log: the first matching event strictly *after*
  first exposure and inside the metric's attribution window
- Per-variant table of exposures, conversions, conversion rate, relative lift, a 95%
  confidence interval on the absolute difference, and a p-value from a two-proportion z-test
- The baseline is chosen automatically — a holdout if there is one (the only true baseline
  for incrementality), otherwise the variant running the original journey
- Below 100 exposures or 30 conversions per arm the comparison is **withheld** rather than
  shown, and the panel says why

**Contact governance** (`/governance`)
- Air traffic control rules that live outside journeys, so one change protects them all
- Rules match on profile context (`profile.tenureDays`, `profile.engagementTier`, …) and set
  a cap; the most restrictive match wins and caps can only ever reduce
- A live preview resolves the draft policy against every seeded profile before you save
- Journeys read the resolved cap through a `Contact Cap` node; a journey may be *stricter*
  than governance but never more permissive

**Cross-journey exclusion** (`Exclusion Check` node)
- Suppress a profile who was already contacted by another journey, or by one specific message
- References are stored as a journey **lineage key**, so rebuilding the referenced journey as
  a new version keeps the suppression working with no edit
- **Stop and rebuild as vN** archives the current version and opens a new draft in the same
  lineage, listing which journeys reference it before you commit

**Profile explorer** (`/profiles`)
- Search by name, customer ID or email; filter by loyalty tier, app installed and country
- Detail view with identity, attributes, contactability, active journeys, an event
  timeline with expandable JSON payloads, and message history

**Overview, Events, Connections, Settings** — polished supporting pages. Events,
Connections and Settings are intentionally previews that communicate product direction.

---

## Architecture

```
Journey Definition          src/domain/journey.ts
   ↓
Journey Canvas              src/components/journey/  (React Flow, via flow-mapping.ts)
   ↓
Simulation Engine           src/simulation/engine.ts
   ↓
Profile / Event Context     src/domain/expression.ts, src/domain/profile.ts
   ↓
Policy Evaluation           src/services/policy.ts
   ↓
Mock Actions                src/services/channels.ts
```

### The canonical model is not the canvas

`JourneyDefinition` (`src/domain/journey.ts`) is the source of truth. It has no React and no
React Flow imports. The canvas is a *view* over it: `src/components/journey/flow-mapping.ts`
is the only file that translates between the domain model and React Flow's `Node`/`Edge`
types.

That boundary is what makes a journey portable enough to be generated, versioned,
validated, simulated, exported and imported — which is exactly what `View definition`
demonstrates.

### Simulation is a pure function

`SimulationEngine.run()` takes a journey, a profile and an event, and returns the entire
trace at once. Nothing is asynchronous and no timer is involved: waits advance a virtual
clock inside the walk.

Producing the whole trace up front is what makes Step, Continue and Restart trivial — they
are cursor moves over an array — and it is why a journey with a 21-day wait can be explored
instantly.

### Experiments sit outside journeys and intercept at runtime

An experiment is its own record, keyed to the journey's lineage key. Journeys carry no
experiment configuration at all. On entry the engine asks the `ExperimentDirectory` whether a
running experiment targets this journey, and routes the profile from there.

That separation is the whole point. Putting an experience under test, changing the split, or
ending the test is a change to the experiment record only — the live journey is not edited,
not republished, and not interrupted. Pausing an experiment restores the original experience
on the next entry with no deploy.

Testing a *different* experience is done by forking: the variant points at a separate journey
definition, which the profile runs instead. The original journey still logs an entry and an
exit stamped with the experiment and variant, so a profile's history shows they entered and
what happened to them, while the experience itself ran elsewhere. Two journeys can therefore
be compared cleanly without either being a special case of the other. Fork chains are depth-
limited, and a variant pointing at a missing journey stops the run rather than silently
falling back to the original — a silent fallback would invalidate the test without anyone
noticing.

### Exposure is a fact; assignment is a function

Assignment needs no storage — it is a hash. But a hash tells you which variant someone *would*
get, not that they were ever exposed to anything, and lift computed over "everyone who might
have entered" is meaningless. So exposures are persisted, and they are the only thing written
on the hot path.

The rule that matters is **one exposure row per profile per experiment**. Re-entry increments
a counter; it never adds a row. If re-entries created exposures, the denominator would inflate
every time a customer came back, quietly deflating the conversion rate of whichever variant
happens to re-trigger most often — an artefact that looks exactly like a real result.

The recorded variant is also pinned on first exposure and never refreshed. It cannot change
(assignment is deterministic), but pinning it means a later edit to the allocation cannot
retroactively rewrite which arm somebody was measured in.

Conversions are *not* stored. They are attributed at read time from the event log — the first
matching event strictly after exposure and inside the attribution window. Copying events into
a second table would only let the two drift.

### Lift is reported, or explicitly withheld

`compareProportions` runs a two-proportion z-test: pooled standard error for the statistic
(the null assumes equal rates), unpooled for the confidence interval (it should not). Below
100 exposures or 30 conversions per arm no comparison is computed at all — the panel shows why
instead of a tempting number, because an underpowered difference is the easiest way to ship a
wrong decision.

The seeded historical volume is synthetic and labelled as such in the UI. The statistics over
it are genuinely computed, not asserted — but the volume itself is fabricated for the demo.

### Assignment stickiness is structural, not bookkeeping

Assignment is a pure function of `(experiment id, profile id)` — an FNV-1a hash into 10,000
buckets. Nothing is rolled, nothing is stored, so there is no ledger that can be missed and no
race on re-entry.

That is what makes the guarantee hold: a profile re-entering the journey — today, tomorrow, or
after the journey has been rebuilt as a new version — lands in exactly the same variant, so a
held-out customer can never be contacted by accident. The experiment id is deliberately
separate from the journey id, so versioning the journey under test changes nothing about who
is in which group.

Variants are allocated in declaration order, which makes order semantically meaningful: the
migration that lifted the old journey-embedded holdouts into standalone experiments has to put
the holdout first, because the embedded model held out the *lowest* buckets. Reordering the
list re-randomises a running test.

Percentage-split nodes use the same bucketing for the same reason.

### Caps only ever reduce

Contact governance is a workspace ceiling plus rules that can lower it. When several rules
match a profile, the effective cap is the **lowest** one, compared as a normalised
messages-per-day rate so windows of different lengths are comparable. Two tie-breaks keep the
result explainable: a shorter window beats a longer one at the same rate (a daily limit also
prevents a week's allowance arriving at once), and an explicit rule beats the implicit ceiling
so a matching rule is credited rather than looking inert.

Because rules only subtract, adding governance can never accidentally increase how often
someone is contacted — the property that keeps the system safe as rules accumulate.

### References point at lineage, not versions

Every journey carries a stable `key` shared by all its versions, alongside its per-version
`id`. Exclusion rules, message history and participations all store the `key`.

Stopping a journey and rebuilding it therefore does not break anything: the archived version
keeps its `supersededById`, the new draft carries the same key, and every inbound reference
resolves to whichever version is live. Messages sent by the old version still suppress
correctly under the new one, because message history is keyed the same way. Message creatives
carry their own stable `messageKey` so copy can be rewritten without breaking references to
it.

### Storage is split by who writes it

Profiles, events and messages are **rows**. Journeys, triggers, the contact policy and
experiments are **jsonb documents** in a key/value table.

The split is about concurrency, not size. The website intake endpoint and the trigger cron
both write clients and events and can fire at the same moment — a read-modify-write of a
whole collection would silently drop one of them. Rows with targeted upserts cannot.
Configuration has exactly one writer, the UI, one change at a time.

The `doc` column holds the full domain object and stays the source of truth; the extracted
columns exist only to be indexed. Adding a field to a domain type therefore needs no
migration, while `wedding_date` and `booking_status` stay queryable for the scheduler.

### Postgres, locally and in production

With `DATABASE_URL` unset the app runs **PGlite** — Postgres compiled to WebAssembly,
in-process, storing to `data/pg`. It is not an emulation: it is the same engine, so the SQL,
the types and the transaction semantics match production exactly. That means there is no
database to install to work on this, and the tested surface equals the shipped surface,
because only the connection differs.

Set `DATABASE_URL` and the same statements run against a real server through `pg`.

```bash
DATABASE_URL="postgresql://user:pass@host:5432/dbname" npm run dev
```

### Multi-tenancy from the start

Every table carries `tenant_id` and every query filters on it, even though there is one
tenant today. Retrofitting that across every table and every query later is miserable; doing
it now costs nothing and means a second workspace becomes a configuration change rather than
a migration. Override with `CADENCE_TENANT_ID`.

### Service boundaries

`src/services/ports.ts` declares the seams that real infrastructure would fill:

| Interface | PoC implementation | Later |
| --- | --- | --- |
| `JourneyRepository` | Postgres jsonb documents | same, hosted |
| `ProfileRepository` | seeded fixtures | profile store / CDP |
| `EventRepository` | seeded fixtures | event log |
| `ChannelProvider` | records and returns `simulated` | SES, FCM/APNS, SMS |
| `PolicyEvaluator` | explicit rule set | consent & preference service |
| `FrequencyGovernor` | resolves caps from the local policy | central governance service |
| `ExperimentRepository` | Postgres jsonb documents | experiment platform API |
| `ExperimentDirectory` | in-memory lookup on entry | experiment assignment service |
| exposure ledger | Postgres documents + seeded aggregates | ClickHouse / warehouse |
| `ContactPolicyRepository` | Postgres jsonb documents | same, hosted |
| `JourneyDirectory` | resolves lineage keys locally | journey registry |
| `JourneyExecutor` | in-process virtual-clock walk | durable workflow engine |

Every repository method is `async` even though the client cache is synchronous, so swapping in
a network-backed implementation is a change of implementation only — never a change of
caller.

`src/services/storage.ts` is the only file the client uses to reach data; `src/server/` is the
only place the database is touched.

---

## Where things live

| Path | What it holds |
| --- | --- |
| `src/domain/` | The journey model, profiles, events, expressions, virtual time, validation. No React. |
| `src/simulation/` | The execution engine and its trace types |
| `src/services/` | Port interfaces plus local/mock implementations |
| `src/seed/` | Fictional profiles, the two demo journeys, events and message history |
| `src/components/journey/` | Canvas, custom nodes, node library, properties panel, simulation panel, JSON dialog |
| `src/components/ui/` | shadcn-style primitives built on Radix |
| `src/hooks/` | Data loading and the simulation controller |
| `src/app/` | App Router pages |

---

## Future architecture

Nothing below is implemented. These are the places the current seams would connect:

- **PostgreSQL** — behind `JourneyRepository` and `ProfileRepository`; journey versions
  become their own rows.
- **Redis** — profile/context caching in front of `ProfileRepository`, plus frequency-cap
  counters currently held in `messagesInLast24h`.
- **Kafka / Redpanda** — the ingest side of `EventRepository`; the trigger node becomes a
  subscription rather than a picker in a modal.
- **Temporal** — replaces `JourneyExecutor`. Waits become durable timers instead of virtual
  clock arithmetic; the simulator keeps the in-process engine for previews.
- **ClickHouse** — journey analytics and the event-volume figures on the Overview page.
- **AWS SES / FCM / APNS** — implementations of `ChannelProvider`, registered in
  `src/services/channels.ts`.

Deliberately **not** built: authentication, billing, organisations, identity stitching,
audience segmentation, AI features and deployment infrastructure.

---

## Known limitations

- Everything persists to Postgres. Locally that is PGlite (the real Postgres engine compiled
  to WASM) in `data/pg`; in production, set `DATABASE_URL` and it is an ordinary Postgres
  server. Same SQL either way.
- The client fetches the whole dataset once at start-up and reads it synchronously from an
  in-memory cache. Fine at hundreds of records; it would need pagination in the thousands.
- Writes are optimistic — the UI updates first and the save happens in the background. A
  failed save raises a toast rather than rolling the screen back.
- Triggers only fire when someone presses "Run due triggers". Nothing happens on a schedule.
- Interpolation covers `{{profile.*}}`, `{{event.*}}`, `{{journey.*}}` and `{{trigger.*}}`.
  There is no formatting — a date renders as an ISO string unless the trigger payload
  pre-formats it.
- Frequency counters are trailing totals held on the profile (`messagesInLast24h`,
  `messagesInLast7d`) rather than a replay of the message log. A real build would keep these
  in a counter store; windows other than roughly a day or a week fall back to the 7-day count.
- Historical experiment volume is a synthetic per-variant aggregate, not tens of thousands of
  rows in the database. Individual exposure rows exist only for the nine demo clients. A
  warehouse-backed implementation would compute both sides with one query.
- Only one primary metric per experiment, and no sequential-testing correction — repeatedly
  checking a running experiment inflates the false-positive rate.
- One running experiment may target a journey at a time; overlapping tests on the same
  audience would confound each other, so the first running one wins.
- Exclusion evaluates against seeded message history plus sends made earlier in the same run.
  It does not model messages another journey would send concurrently.
- Percentage Split is bucketed on the profile, so a client always lands in the same branch.
- `Wait Until` understands `path ± amount unit` (and absolute dates) — not a general date
  language.
- Simulation runs are not persisted; closing the panel discards the trace.

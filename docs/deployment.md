# Deploying

What it takes to run this as a real product rather than on one laptop.

## What you need

| Thing | Why | Cost |
| --- | --- | --- |
| A git remote | Hosts deploy from a repository | Free (GitHub, private) |
| A host that runs a container | Next.js server plus, later, a long-lived worker | ~£5/mo |
| A Postgres database | The app refuses to start in production without one | Free tier is enough |
| A scheduler | Nothing advances on its own otherwise | Free |

Pure serverless hosting (Vercel, Netlify) will run the app, but the outbox worker that comes
with real sending wants a process that stays alive. A container host avoids changing
platforms later.

## Environment variables

Copy `.env.example`. Four matter:

| Variable | Needed | What happens without it |
| --- | --- | --- |
| `DATABASE_URL` | **Production: required** | The app refuses to start, rather than silently using a local database that is wiped on every deploy |
| `APP_PASSWORD` | **Production: required** | Every page returns 503 rather than serving a client list with no password |
| `CRON_SECRET` | **Production: required** | `/api/cron` refuses to run rather than letting anyone on the internet trigger a send |
| `INTAKE_ALLOWED_ORIGINS` | Strongly recommended | Any website could post to the enquiry form |

> **Why they fail loudly**
> Each of these guards something that cannot be undone — a lost database, an exposed client
> list, messages sent to real people. A forgotten variable that merely degrades quietly is
> the version of this that actually goes wrong, so the app refuses to run instead.

Locally none are needed. The app runs PGlite, skips the password and allows any origin, so
there is nothing to configure to work on it.

## Steps

### 1. Push to a private repository

Private, not public: the repository itself holds no client data, but a public one invites
people to look for the deployment.

### 2. Create a Postgres database

Supabase free tier is enough. Take the **connection string** from
Project settings → Database → Connection string → URI.

Two things to know about the free tier:

- It **pauses after 7 days of inactivity**. The daily scheduler is enough to keep it awake.
- It has **no backups**. For real client data, either take the paid tier or run your own
  `pg_dump` on a schedule. Losing a wedding client list is not recoverable by apology.

### 3. Deploy the container

A `Dockerfile` is included and works on Railway, Fly.io and Render unchanged. Point the host
at the repository, set the environment variables, deploy.

The container exposes a health check at `/api/health`, which queries the database — so a
container that is up but cannot reach Postgres is correctly reported as unhealthy rather
than being sent traffic.

### 4. Point a scheduler at the cron endpoint

Once a day, at a civilised hour:

```bash
curl -X POST https://your-app/api/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

Any of these work: the host's built-in cron, GitHub Actions on a schedule, or a free pinger
such as cron-job.org.

Daily is enough — the countdowns work at day granularity, and it also means nobody gets a
text at 3am.

Check it with a dry run first, which reports what would happen and writes nothing:

```bash
curl -X POST "https://your-app/api/cron?dryRun=true" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### 5. Lock down the enquiry form

Set `INTAKE_ALLOWED_ORIGINS` to the website's domains, comma-separated, including and
excluding `www` as appropriate:

```
INTAKE_ALLOWED_ORIGINS=https://example.co.uk,https://www.example.co.uk
```

Then update the form's `action` on the website to the deployed URL. The snippet is on the
**Add client** page.

## Access control

One shared password, set as `APP_PASSWORD`. Everything is behind it except three paths:

| Path | Why it is open |
| --- | --- |
| `/api/intake` | The public website form. Protected instead by a honeypot, a rate limit and the origin allowlist. |
| `/api/cron` | Called by a scheduler with no browser session. Carries a bearer token instead. |
| `/api/health` | So an uptime monitor can reach it. Reveals only whether the service is up. |

Sessions are a signed cookie lasting 14 days. Changing `SESSION_SECRET` signs everyone out
without changing the password.

> **Watch out**
> This is one password shared by everyone who uses it. There are no individual accounts, no
> roles and no audit of who did what. That is proportionate for one or two people and would
> not be for a team.

## Before real customer data goes in

Hosting makes the app reachable. It does not make it lawful to start messaging people.

- [ ] **A privacy notice on the enquiry form** — what is collected, why, how long it is kept
- [ ] **An unsubscribe link in every marketing message** — required under PECR, and not built
      yet
- [ ] **A backup** — Supabase free has none
- [ ] **Check consent wording** on the form matches what you actually intend to send
- [x] **A way to service access and erasure requests** — see [Privacy requests](privacy-requests.md)

Transactional messages (a booking confirmation someone asked for) rest on a different footing
to marketing ones (an upsell). The product already separates consent per channel; the
unsubscribe route is the missing piece.

## What still will not work once deployed

Being honest about what hosting does and does not buy:

- **No email or SMS is sent.** Every send is recorded as `simulated`. The provider adapters
  are not built.
- **SMS is modelled as email nodes.** Journeys labelled "SMS · …" use `send_email` nodes
  because there is no `send_sms` node kind yet. This must be fixed before connecting a real
  provider, or SMS copy would go out by email.
- **No outbox.** Sends are decided and recorded in one step, so there are no retries and no
  queue to inspect before messages go out.

So a deployment today gives a real, shared, multi-device client list with working countdowns
and simulation. It does not yet message anybody.

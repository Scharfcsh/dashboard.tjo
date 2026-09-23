# TopJobOffer Analytics API

Collector, derived-state engine and internal dashboards for the system described in
`TopJobOffer_8_Dashboard_Developer_SOP.pdf`. Five of the eight dashboards are built (Revenue
Command Center, Live User Intelligence, User 360, PQL & Auto Apply Intelligence, Sales Caller CRM);
the rest of the API is ready for them.

```
betterapply ──POST /api/events (browser, keyless)──┐
            ──POST /api/events (server, x-api-key)─┤──> user_events ──┐
            ──POST /api/logs   (server, x-api-key)─┘    request_logs  │  jobs (every 2m / hourly / nightly)
                                                                      ▼
    users · user_sessions · user_daily_metrics · user_milestones · auto_apply_usage · subscriptions
    pql_scores(+history) · lifecycle_state(+history) · alerts · sales_leads
    experiment_assignments                                                       ──> read APIs
```

## Setup

```bash
docker compose up -d            # Postgres 16 on localhost:5433 (events_db)
cp .env.example .env.local      # then set the keys
npm install
npm run db:migrate
npm run dev

# optional: deterministic demo users (SOP 18.1), then derive state
BASE_URL=http://localhost:3000 npm run db:seed
BASE_URL=http://localhost:3000 npm run db:seed:bulk   # + ~420 users across the usage ladder
curl -X POST localhost:3000/api/internal/run-rollup  -H "x-api-key: $ADMIN_API_KEY"
curl -X POST localhost:3000/api/internal/run-scoring -H "x-api-key: $ADMIN_API_KEY"
```

| Command | |
|---|---|
| `npm test` | unit tests (pure logic: payloads, time, scoring, DSL, billing fold) |
| `npm run test:integration` | full pipeline against `TEST_EVENTS_DATABASE_URL` (wiped; name must contain "test") |
| `npm run typecheck` / `npm run lint` / `npm run build` | |

Environment (see `.env.example`): `EVENTS_DATABASE_URL`, `INGEST_API_KEY` (= betterapply's
`EVENTS_API_KEY`), `ADMIN_API_KEY`, `ALLOWED_ORIGINS`, `BUSINESS_TIMEZONE` (default
`Asia/Kolkata`), `JOBS_ENABLED`, `ONLINE_WINDOW_SECONDS` (300), `SESSION_IDLE_MINUTES` (30),
`AUTO_ASSIGN_LEADS` (false), `INGEST_RATE_LIMIT_PER_MINUTE` (120).

## Dashboards (UI)

| Route | Dashboard | Notes |
|---|---|---|
| `/overview` | Revenue Command Center | KPIs, funnel, revenue opportunities, growth chart, sales + alerts |
| `/live-users` | Live User Intelligence | Who is online now, what they are doing, live session preview, event stream |
| `/user-intelligence` | User 360 | Searchable directory; `/user-intelligence/<user_id>` is the full profile |
| `/pql-leads` | PQL & Auto Apply Intelligence | Free-usage ladder, upgrade queue, near-limit cohort, markets, triggers, experiments |
| `/sales-crm` | Sales Caller CRM | Who to call next and why, the pitch, the queue, call outcomes, follow-ups, pipeline |

All five read the live analytics database through `lib/*/load.ts` and fall back to clearly
labelled demo data (amber "Demo data" badge + banner) when it is unreachable or empty, so the
UI is demoable without ingestion. Write actions (assign, log contact, note, callback, alert rule)
call the same library functions as the API and are disabled in demo mode.

On `/pql-leads`, the date range selects a **cohort** for the funnel, market and trigger panels;
the usage stages, critical signals, PQL bands and the upgrade queue are **current state** and do
not move with it - each panel's info tooltip says which it is. The usage/score/intent/owner/status
filters narrow the queue, the near-limit cohort and the CSV export only. "Export cohort" omits
email and phone (a file leaves the browser; the page only ever shows them masked) and "Create
alert rule" saves an **inactive draft**, so nothing starts firing from a dashboard click. Bulk
assignment, campaign sends and queue creation are deliberately disabled and say why on hover.

`/sales-crm` is an execution workspace rather than a report. A **caller switcher** in the header
stands in for sign-in and decides whose queue the page shows; picking a `sales_manager` also
reveals Caller Performance, Response SLA and the round-robin control (SOP 12: a caller sees only
their own leads). Call Next is never re-sorted client-side — it is the ordering in
`lib/dashboards/sales.ts`: due callbacks, then P0 leads past their SLA, then priority, then PQL
score. **A connected call must be given an outcome**: `pending_disposition` is computed
server-side, so the prompt survives a reload. Call, WhatsApp and Email release the real number or
address (one audited moment — the page itself only ever holds masked values), open the device's
own handler, and log the attempt. Activity is recorded under the selected caller's team-member id,
so the leaderboard credits a real person; the other dashboards still log as `dashboard:admin`.

**KNOWN GAP:** dashboard pages and their Server Functions are **not authenticated** — `proxy.ts`
only guards `/api/*`. Add sign-in before exposing them outside localhost.

## Conventions (apply to every endpoint)

**Auth.** `proxy.ts` requires `ADMIN_API_KEY` (`x-api-key` or `Authorization: Bearer`) on all
`/api/*` except ingestion. Ingestion is split-trust:
- a correct `INGEST_API_KEY` is trusted and may send any event;
- no key is accepted only from `ALLOWED_ORIGINS`, rate limited, and **server-only events
  (payment_\*, subscription_\*, auto_apply_\*, user_identified, …) are rejected** - browsers
  cannot hold a secret, and `sendBeacon` cannot send headers.

Mutating sales/support endpoints require `x-actor-id` (a `team_members.id` for caller views).

**Time.** Instants are stored and returned in UTC. "Today" and every business date use
`BUSINESS_TIMEZONE`. Ranges: `range=today|yesterday|7d|30d|90d|custom&from=YYYY-MM-DD&to=`
(inclusive business dates); trends compare with the equally long previous period. One
implementation: `lib/time/business-time.ts` in TS, `business_date()`/`business_today()` in SQL,
fed by the same env var. Responses echo `meta.timezone/from/to`.

**Metrics.** Aggregates read derived tables only - never raw events. Each metric has one
definition (`lib/metrics/definitions.ts`) and one query (`lib/metrics/kpis.ts`), and responses
include `definitions` for what they return. Paid (`is_paid_user()`) and online
(`online_cutoff()`) are single SQL functions. PQL score, lifecycle stage and priority are only
computed by the scoring job. Exceptions by design: per-user timelines and the live event
stream show raw events without computing anything from them.

**Pagination.** Event/session/history/activity lists: `limit` + opaque `cursor` →
`page.next_cursor`. Leads/alerts/cohorts/opportunities: `limit` + `offset` → `page.total`.

**Errors.** `{ "error": { "code", "message", "details"? } }` with stable codes
(`UNAUTHORIZED`, `VALIDATION_FAILED`, `NOT_FOUND`, `INVALID_STATE`, `CONFLICT`, `RATE_LIMITED`, …).

**PII.** Email/phone masked unless `?reveal_pii=true`, which is audit-logged.

## Endpoints

| Area | Endpoints |
|---|---|
| Ingestion | `POST /api/events` · `POST /api/logs` |
| Jobs | `POST /api/internal/run-rollup` `{from?,to?,user_id?}` · `POST /api/internal/run-scoring` `{all?,user_ids?}` · `GET /api/internal/jobs` |
| D1 Founder | `GET /api/overview` · `/overview/funnel` · `/overview/revenue-opportunities` · `/overview/sales-summary` · `/overview/alerts-summary` |
| D2 Live | `GET /api/live/users` · `/live/users/:userId/session` · `/live/events` · `POST /api/live/assign` |
| D3 User 360 | `GET /api/users/:userId/360` · `/sessions` · `/pql-history` · `/sales-activities` · `POST /notes` |
| D4 Monetization | `GET /api/monetization/usage-stages` · `/hot-leads` · `/funnel` · `/trigger-effectiveness` · `/critical-signals` · `/pql-distribution` · `/lead-reasons` · `/near-limit` · `/markets` · `/experiments` |
| D5 Sales CRM | `GET /api/sales/my-leads` · `/next-lead` · `/kpis` · `/lead-pool` · `/pipeline` · `/callbacks` · `/sla` · `/leaderboard` · `/leads/:leadId` · `POST /api/sales/leads/:leadId/activities` · `/disposition` · `/callback` · `POST /api/sales/assign-round-robin` |
| D6 Segments | `GET /api/segments/summary` · `/segments/movements` · `POST /api/cohorts/preview` · `POST|GET /api/cohorts` · `GET /api/cohorts/fields` |
| D7 Growth | `GET /api/analytics/activation-funnel` · `/retention-cohorts` · `/acquisition-quality` · `/feature-adoption` |
| D8 Alerts | `GET /api/alerts` · `POST /api/alerts/:alertId/resolve` · `GET|POST /api/automation-rules` · `POST /api/automation-rules/:ruleId/test` · `/activate` |

Each route file's header comment documents its parameters and body.

## Background jobs (`lib/jobs`)

Started by `instrumentation.ts` when `JOBS_ENABLED=true`; every run holds a Postgres advisory
lock, so any number of instances is safe, and records a `job_runs` row.

| Job | When | Does |
|---|---|---|
| pipeline | every 2 min | incremental (by `received_at` watermark): derive `checkout_abandoned` → billing → users → sessions → daily metrics → milestones → usage → experiment assignments, then PQL + lifecycle + priority → alert rules → leads |
| sweep | hourly | rescore everyone (no-activity penalties and dormancy are time-driven) |
| nightly | after 00:30 business time | re-roll yesterday for late events |

Scoring rules live as data: `lib/scoring/pql-config.ts` (SOP 5.2), `lifecycle-config.ts` (5.1),
`priority.ts` (5.3/5.4). Bump the version constant when changing them.

## Sales attribution

Two definitions the CRM depends on, written once and echoed in every response that uses them:

- **Revenue credited to a caller** — successful payments by users whose lead that caller owns,
  made **after** the lead was created. Someone who was already paying is not the caller's work.
- **Pipeline stage** — each of a caller's open or converted leads counted **once**, in the
  furthest stage it has reached, so the strip can never total more than their leads. Lost leads
  are excluded.

The leaderboard groups by the lead's **owner**, not by who logged the activity, so work counts for
whoever owns the relationship.

## Experiments

`experiment_assigned` events (server-only, `{experiment_id, variant}`) are folded into
`experiment_assignments` by the rollup. **The first assignment a user receives wins**, so a
re-bucketed user is never counted in two arms and reruns change nothing; every variant the
product reports is registered even before it has users. An unknown experiment id auto-creates a
`draft` row named after itself - rename it and mark the control in `experiments` /
`experiment_variants`. Conversion counts a first payment **after** assignment, and confidence is
a two-tailed two-proportion z-test against the control (`lib/experiments/stats.ts`), so a small
sample honestly reads low instead of looking decisive.

## Known gaps / follow-ups

- **RBAC:** one shared admin key; `x-actor-id` is trusted as given. Caller/manager/founder
  permissions (SOP 17.1) are not enforced.
- **Keyless rate limiting** is in-memory per instance and keys on `x-forwarded-for` - run behind
  a proxy that sets it.
- **No outbound communications:** WhatsApp/email rule actions are recorded as skipped. The CRM's
  Call/WhatsApp/Email buttons open the device's own handler — there is no telephony integration,
  so call duration is typed by the caller and there is no recording or delivery confirmation.
- **Sales CRM gaps:** reassigning a lead, caller availability, editable capacity and
  country/language routing are not built (there is no language field in the schema). Live mode
  starts with no call history, so Connected, Converted, revenue, the leaderboard and the SLA
  averages read zero until the CRM is used.
- **Lifecycle thresholds** are the SOP's "suggested definitions" made concrete - confirm with
  the business (Phase 0).
- Needed from **betterapply**:
  1. send `user_identified` (email, name, phone, country, city, signup_at, plan, target_role,
     experience, utm_*) on signup/profile/plan changes, plus a one-off backfill;
  2. include `used` on `auto_apply_success`/`auto_apply_failed`;
  3. add request-log middleware posting to `/api/logs`;
  4. set `NEXT_PUBLIC_EVENTS_ENDPOINT` to this service and add its origin to `ALLOWED_ORIGINS`;
  5. send `experiment_assigned {experiment_id, variant}` server-side when a user is bucketed -
     until then the Free Plan Experiments panel shows an empty state rather than invented numbers;
  6. optional: utm/referrer on the first browser event, a 60s `heartbeat` for fresher "online
     now", and `upgrade_prompt_shown {trigger}` for true exposure-based trigger analysis (until
     then the trigger panel counts threshold arrivals and labels itself accordingly).
- Deferred: monthly partitioning of `user_events`, data-retention jobs, exports.

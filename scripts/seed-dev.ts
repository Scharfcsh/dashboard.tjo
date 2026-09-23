// ---------------------------------------------------------------------------
// Deterministic development/test data (SOP 18.1): named users walk signup ->
// activation -> usage milestones -> pricing -> checkout -> payment, sent through
// the real HTTP ingestion endpoint exactly as betterapply would send them.
//
//   npm run db:seed                       (dev server on BASE_URL, default http://localhost:3000)
//   BASE_URL=http://localhost:3100 npm run db:seed
//
// Event ids are stable, so re-running is a no-op (every event is a duplicate).
// Times are relative to "now" at the first run.
// ---------------------------------------------------------------------------
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const INGEST_KEY = process.env.INGEST_API_KEY!;
const ORIGIN = (process.env.ALLOWED_ORIGINS ?? "").split(",")[0]?.trim() || "http://localhost:3000";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface Ev {
  event_id: string;
  event_name: string;
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  occurred_at: string;
  page: string | null;
  properties: Record<string, unknown>;
}

export function buildSeedEvents(now = Date.now()) {
  const client: Ev[] = [];
  const server: Ev[] = [];
  const counters = new Map<string, number>();
  const id = (u: string) => {
    const n = (counters.get(u) ?? 0) + 1;
    counters.set(u, n);
    return `seed:${u}:${n}`;
  };
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();

  const browser = (u: string, anon: string, session: string, name: string, msAgo: number, page: string, props = {}) =>
    client.push({
      event_id: id(u),
      event_name: name,
      user_id: u,
      anonymous_id: anon,
      session_id: session,
      occurred_at: at(msAgo),
      page,
      properties: props,
    });
  const srv = (u: string, name: string, msAgo: number, props = {}) =>
    server.push({
      event_id: id(u),
      event_name: name,
      user_id: u,
      anonymous_id: null,
      session_id: null,
      occurred_at: at(msAgo),
      page: null,
      properties: props,
    });
  const identify = (u: string, msAgo: number, traits: Record<string, unknown>) => srv(u, "user_identified", msAgo, traits);

  /** n auto-apply runs spread before `endAgo`, reporting `used` on milestones like betterapply. */
  const autoApplies = (u: string, count: number, startUsed: number, endAgo: number, spacing = 20 * MIN) => {
    for (let i = 1; i <= count; i++) {
      const used = startUsed + i;
      const t = endAgo + (count - i) * spacing;
      srv(u, "auto_apply_started", t + 2 * MIN, { application_id: `${u}-app-${used}`, plan: "FREE" });
      srv(u, "auto_apply_success", t, { application_id: `${u}-app-${used}` });
      if ([10, 25, 40, 45, 49, 50].includes(used)) srv(u, "auto_apply_milestone", t, { milestone: used, used, plan: "FREE" });
    }
  };

  // 1. Vishal - 50/50 exhausted, pricing x3, Pro clicked, checkout abandoned 2h ago => P0.
  {
    const u = "seed_vishal";
    identify(u, 12 * DAY, {
      email: "vishal.sharma@example.com",
      name: "Vishal Sharma",
      phone: "+919876548210",
      country: "IN",
      city: "Bengaluru",
      signup_at: at(12 * DAY),
      target_role: "Software Engineer",
      experience: "4 years",
      utm_source: "instagram",
      utm_medium: "organic",
      utm_campaign: "bangalore_reel_07",
    });
    browser(u, "anon_vishal", "sess_vishal_1", "signup_completed", 12 * DAY, "/onboarding", { referred: false, how_heard: "instagram" });
    browser(u, "anon_vishal", "sess_vishal_1", "resume_uploaded", 12 * DAY - 5 * MIN, "/onboarding", { source: "onboarding", parsed: true });
    browser(u, "anon_vishal", "sess_vishal_1", "job_viewed", 12 * DAY - 10 * MIN, "/jobs", { job_id: "j1" });
    for (let d = 11; d >= 1; d -= 2) {
      browser(u, "anon_vishal", `sess_vishal_d${d}`, "login", d * DAY, "/");
      browser(u, "anon_vishal", `sess_vishal_d${d}`, "job_viewed", d * DAY - 3 * MIN, "/jobs", { job_id: `j${d}` });
    }
    autoApplies(u, 50, 0, 3 * HOUR, 90 * MIN);
    browser(u, "anon_vishal", "sess_vishal_today", "login", 2 * HOUR + 30 * MIN, "/");
    browser(u, "anon_vishal", "sess_vishal_today", "pricing_viewed", 2 * HOUR + 20 * MIN, "/pricing");
    browser(u, "anon_vishal", "sess_vishal_today", "pricing_viewed", 2 * HOUR + 15 * MIN, "/pricing");
    browser(u, "anon_vishal", "sess_vishal_today", "pricing_viewed", 2 * HOUR + 10 * MIN, "/pricing");
    browser(u, "anon_vishal", "sess_vishal_today", "pro_clicked", 2 * HOUR + 5 * MIN, "/pricing", { plan: "PRO", cycle: "MONTHLY", surface: "pricing" });
    browser(u, "anon_vishal", "sess_vishal_today", "checkout_started", 2 * HOUR, "/pricing", { plan: "PRO", cycle: "MONTHLY" });
    srv(u, "checkout_started", 2 * HOUR, { plan: "PRO", cycle: "MONTHLY", amount: 55900, currency: "INR", subscription_id: "sub_vishal", confirmed: true });
    browser(u, "anon_vishal", "sess_vishal_now", "job_viewed", 1 * MIN, "/jobs", { job_id: "jnow" });
  }

  // 2. Priya - paid Pro after checkout => paid, lead-free.
  {
    const u = "seed_priya";
    identify(u, 20 * DAY, { email: "priya.mehta@example.com", name: "Priya Mehta", phone: "+919812345678", country: "IN", signup_at: at(20 * DAY), utm_source: "google", target_role: "Data Analyst" });
    browser(u, "anon_priya", "sess_priya_1", "signup_completed", 20 * DAY, "/onboarding", { how_heard: "google" });
    browser(u, "anon_priya", "sess_priya_1", "resume_uploaded", 20 * DAY - 3 * MIN, "/onboarding", { source: "onboarding" });
    browser(u, "anon_priya", "sess_priya_1", "job_viewed", 20 * DAY - 6 * MIN, "/jobs", { job_id: "p1" });
    autoApplies(u, 12, 0, 15 * DAY, 60 * MIN);
    browser(u, "anon_priya", "sess_priya_2", "pricing_viewed", 5 * DAY, "/pricing");
    browser(u, "anon_priya", "sess_priya_2", "premium_clicked", 5 * DAY - 2 * MIN, "/pricing", { plan: "PREMIUM", cycle: "QUARTERLY" });
    srv(u, "checkout_started", 5 * DAY - 3 * MIN, { plan: "PREMIUM", cycle: "QUARTERLY", amount: 279900, currency: "INR", subscription_id: "sub_priya", confirmed: true });
    srv(u, "subscription_started", 5 * DAY - 5 * MIN, { razorpay_event: "subscription.activated", subscription_id: "sub_priya", subscription_status: "active", plan: "PREMIUM", cycle: "QUARTERLY", current_period_end: at(-85 * DAY) });
    srv(u, "payment_success", 5 * DAY - 5 * MIN, { razorpay_event: "subscription.charged", subscription_id: "sub_priya", subscription_status: "active", plan: "PREMIUM", cycle: "QUARTERLY", current_period_end: at(-85 * DAY) });
    // Webhook retry: same provider facts, new event_id - must not double count revenue.
    srv(u, "payment_success", 5 * DAY - 4 * MIN, { razorpay_event: "subscription.charged", subscription_id: "sub_priya", subscription_status: "active", plan: "PREMIUM", cycle: "QUARTERLY", current_period_end: at(-85 * DAY) });
    browser(u, "anon_priya", "sess_priya_3", "login", 30 * MIN, "/");
  }

  // 3. John - paying user whose renewal failed today => P0 payment recovery.
  {
    const u = "seed_john";
    identify(u, 40 * DAY, { email: "john.davis@example.com", name: "John Davis", phone: "+14155550123", country: "US", signup_at: at(40 * DAY), utm_source: "linkedin" });
    browser(u, "anon_john", "sess_john_1", "signup_completed", 40 * DAY, "/onboarding");
    srv(u, "checkout_started", 35 * DAY, { plan: "PRO", cycle: "MONTHLY", amount: 55900, currency: "INR", subscription_id: "sub_john", confirmed: true });
    srv(u, "subscription_started", 35 * DAY - MIN, { subscription_id: "sub_john", subscription_status: "active", plan: "PRO", cycle: "MONTHLY", current_period_end: at(5 * DAY) });
    srv(u, "payment_success", 35 * DAY - MIN, { razorpay_event: "subscription.charged", subscription_id: "sub_john", subscription_status: "active", plan: "PRO", cycle: "MONTHLY", current_period_end: at(5 * DAY) });
    srv(u, "payment_failed", 3 * HOUR, { razorpay_event: "subscription.pending", subscription_id: "sub_john", subscription_status: "pending", plan: "PRO", cycle: "MONTHLY", current_period_end: at(-25 * DAY) });
    browser(u, "anon_john", "sess_john_2", "login", 2 * HOUR, "/");
  }

  // 4. Emily - 46 used, no pricing => P1 near limit.
  {
    const u = "seed_emily";
    identify(u, 9 * DAY, { email: "emily.carter@example.com", name: "Emily Carter", country: "US", signup_at: at(9 * DAY), utm_source: "youtube" });
    browser(u, "anon_emily", "sess_emily_1", "signup_completed", 9 * DAY, "/onboarding");
    browser(u, "anon_emily", "sess_emily_1", "resume_uploaded", 9 * DAY - MIN, "/onboarding");
    browser(u, "anon_emily", "sess_emily_1", "search_performed", 9 * DAY - 2 * MIN, "/jobs");
    autoApplies(u, 46, 0, 6 * HOUR, 60 * MIN);
    for (let d = 6; d >= 0; d--) browser(u, "anon_emily", `sess_emily_d${d}`, "job_viewed", d * DAY + 40 * MIN, "/jobs", { job_id: `e${d}` });
  }

  // 5. Rahul - active three weeks ago, nothing since => dormant.
  {
    const u = "seed_rahul";
    identify(u, 25 * DAY, { email: "rahul.k@example.com", name: "Rahul Kumar", country: "IN", signup_at: at(25 * DAY), utm_source: "instagram" });
    browser(u, "anon_rahul", "sess_rahul_1", "signup_completed", 25 * DAY, "/onboarding");
    browser(u, "anon_rahul", "sess_rahul_1", "job_viewed", 21 * DAY, "/jobs");
  }

  // 6. Aditya - was active, gone 10 days, back today => resurrected.
  {
    const u = "seed_aditya";
    identify(u, 30 * DAY, { email: "aditya.verma@example.com", name: "Aditya Verma", country: "IN", signup_at: at(30 * DAY), utm_source: "google" });
    browser(u, "anon_aditya", "sess_aditya_1", "signup_completed", 30 * DAY, "/onboarding");
    for (const d of [16, 15, 14, 13, 12]) browser(u, "anon_aditya", `sess_aditya_d${d}`, "job_viewed", d * DAY, "/jobs");
    browser(u, "anon_aditya", "sess_aditya_back", "login", 40 * MIN, "/");
    browser(u, "anon_aditya", "sess_aditya_back", "resume_uploaded", 35 * MIN, "/profile", { source: "profile" });
  }

  // 7. Sara - brand new today; browsed anonymously first (identity stitching).
  {
    const u = "seed_sara";
    client.push({ event_id: "seed:anon_sara:1", event_name: "pricing_viewed", user_id: null, anonymous_id: "anon_sara", session_id: "sess_sara_1", occurred_at: at(50 * MIN), page: "/pricing", properties: { utm_source: "campus", utm_campaign: "campus_ambassador" } });
    browser(u, "anon_sara", "sess_sara_1", "signup_completed", 40 * MIN, "/onboarding", { how_heard: "friend" });
    identify(u, 40 * MIN, { email: "sara.khan@example.com", name: "Sara Khan", country: "CA", signup_at: at(40 * MIN) });
  }

  return { client, server };
}

async function post(events: Ev[], trusted: boolean) {
  for (let i = 0; i < events.length; i += 200) {
    const res = await fetch(`${BASE_URL}/api/events`, {
      method: "POST",
      headers: trusted
        ? { "content-type": "application/json", "x-api-key": INGEST_KEY }
        : { "content-type": "application/json", origin: ORIGIN, "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" },
      body: JSON.stringify({ events: events.slice(i, i + 200) }),
    });
    const body = (await res.json()) as { accepted?: number; duplicates?: number; rejected?: unknown[] };
    if (!res.ok || body.rejected?.length) throw new Error(`ingest failed ${res.status}: ${JSON.stringify(body)}`);
    console.log(`${trusted ? "server" : "client"} batch: accepted ${body.accepted}, duplicates ${body.duplicates}`);
  }
}

async function seedTeam() {
  const db = new Client({ connectionString: process.env.EVENTS_DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO team_members (name, email, role, capacity) VALUES
         ('Rahul Caller', 'rahul.caller@topjoboffer.test', 'caller', 40),
         ('Sneha Caller', 'sneha.caller@topjoboffer.test', 'caller', 40),
         ('Amit Manager', 'amit.manager@topjoboffer.test', 'sales_manager', 10)
       ON CONFLICT (email) DO NOTHING`
    );
    const { rows } = await db.query("SELECT id, name, role FROM team_members ORDER BY name");
    console.table(rows);
  } finally {
    await db.end();
  }
}

if (process.argv[1]?.includes("seed-dev")) {
  (async () => {
    const { client, server } = buildSeedEvents();
    await post(server, true);
    await post(client, false);
    await seedTeam();
    console.log("Seeded. Now: POST /api/internal/run-rollup then POST /api/internal/run-scoring");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

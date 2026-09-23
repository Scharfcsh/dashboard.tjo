// ---------------------------------------------------------------------------
// Bulk demo population for the monetization dashboard (Dashboard 4).
//
// Where seed-dev.ts creates a handful of named users to exercise every rule,
// this creates a few hundred users spread across the free Auto Apply ladder,
// five markets and every intent state, so the usage stages, funnel, market
// table and experiments read like a real product instead of near-zero.
//
//   npm run db:seed:bulk                          (dev server on BASE_URL)
//   BULK_USERS=800 BASE_URL=http://localhost:3100 npm run db:seed:bulk
//
// Deterministic: a seeded PRNG and stable event ids, so re-running changes
// nothing and every duplicate is rejected as one. Times are relative to the
// first run.
// ---------------------------------------------------------------------------
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const INGEST_KEY = process.env.INGEST_API_KEY!;
const ORIGIN = (process.env.ALLOWED_ORIGINS ?? "").split(",")[0]?.trim() || "http://localhost:3000";
const USER_COUNT = Number(process.env.BULK_USERS ?? 420);

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

/** mulberry32 - small, fast, and identical on every machine. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MARKETS: { country: string; city: string; weight: number }[] = [
  { country: "IN", city: "Bengaluru", weight: 52 },
  { country: "US", city: "Austin", weight: 24 },
  { country: "GB", city: "Manchester", weight: 11 },
  { country: "CA", city: "Toronto", weight: 8 },
  { country: "AE", city: "Dubai", weight: 5 },
];

const SOURCES = ["organic", "linkedin", "google_ads", "referral", "campus"];
const ROLES = ["Software Engineer", "Data Analyst", "Product Manager", "QA Engineer", "DevOps Engineer"];

const FIRST = ["Aarav", "Diya", "Rohan", "Isha", "Kabir", "Ananya", "Vivaan", "Meera", "Arjun", "Sara", "Liam", "Emma", "Noah", "Olivia", "Ethan", "Ava", "Omar", "Layla", "Jack", "Sophie"];
const LAST = ["Sharma", "Patel", "Nair", "Reddy", "Khan", "Singh", "Carter", "Brooks", "Wilson", "Davis", "Ali", "Hassan", "Murphy", "Chen", "Kumar"];

/** Usage ladder shares, tuned so the stage cards look like a real free funnel. */
const USAGE_BUCKETS: { min: number; max: number; weight: number }[] = [
  { min: 0, max: 10, weight: 56 },
  { min: 11, max: 25, weight: 20 },
  { min: 26, max: 39, weight: 9 },
  { min: 40, max: 44, weight: 4 },
  { min: 45, max: 49, weight: 3 },
  { min: 50, max: 50, weight: 3 },
  { min: 0, max: 0, weight: 5 }, // signed up, never ran Auto Apply
];

const EXPERIMENTS = [
  { id: "free_limit", variants: ["25_free", "50_free"] },
  { id: "upgrade_copy", variants: ["generic", "personalised"] },
];

function pickWeighted<T extends { weight: number }>(items: T[], r: number): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let x = r * total;
  for (const item of items) {
    x -= item.weight;
    if (x <= 0) return item;
  }
  return items[items.length - 1]!;
}

export function buildBulkEvents(now = Date.now(), count = USER_COUNT) {
  const client: Ev[] = [];
  const server: Ev[] = [];
  const random = rng(20260923);
  const counters = new Map<string, number>();
  const id = (u: string) => {
    const n = (counters.get(u) ?? 0) + 1;
    counters.set(u, n);
    return `bulk:${u}:${n}`;
  };
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const srv = (u: string, name: string, msAgo: number, props: Record<string, unknown> = {}) =>
    server.push({ event_id: id(u), event_name: name, user_id: u, anonymous_id: null, session_id: null, occurred_at: at(msAgo), page: null, properties: props });
  const browser = (u: string, session: string, name: string, msAgo: number, page: string, props: Record<string, unknown> = {}) =>
    client.push({ event_id: id(u), event_name: name, user_id: u, anonymous_id: `anon_${u}`, session_id: session, occurred_at: at(msAgo), page, properties: props });

  for (let i = 0; i < count; i++) {
    const u = `bulk_${String(i).padStart(4, "0")}`;
    const market = pickWeighted(MARKETS, random());
    const bucket = pickWeighted(USAGE_BUCKETS, random());
    const used = bucket.min + Math.floor(random() * (bucket.max - bucket.min + 1));
    const signupAgo = (14 + Math.floor(random() * 76)) * DAY;
    const lastActiveAgo = Math.floor(random() * 12) * DAY + Math.floor(random() * 20) * HOUR;

    srv(u, "user_identified", signupAgo, {
      email: `${u}@example.com`,
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      phone: `+9198${String(10000000 + i).slice(0, 8)}`,
      country: market.country,
      city: market.city,
      signup_at: at(signupAgo),
      plan: "FREE",
      target_role: ROLES[i % ROLES.length],
      utm_source: SOURCES[i % SOURCES.length],
    });

    // Every user is bucketed into both experiments, before any usage happens.
    for (const exp of EXPERIMENTS) {
      const variant = exp.variants[random() < 0.5 ? 0 : 1]!;
      srv(u, "experiment_assigned", signupAgo - MIN, { experiment_id: exp.id, variant });
    }

    // Two separate visits: onboarding at signup, and a recent one. They must
    // not share a session id, or the derived session spans the whole lifetime.
    const onboarding = `bulk_s${i}_a`;
    const recent = `bulk_s${i}_b`;
    browser(u, onboarding, "login_success", signupAgo - 2 * MIN, "/login");
    browser(u, onboarding, "onboarding_completed", signupAgo - 8 * MIN, "/onboarding");
    browser(u, onboarding, "resume_uploaded", signupAgo - 12 * MIN, "/resume");
    browser(u, onboarding, "job_viewed", signupAgo - 20 * MIN, "/jobs", { job_id: `job_${i}` });

    if (used === 0) continue;

    // Auto Apply runs, spread between signup and last activity, with the
    // milestone events betterapply sends (these carry the authoritative `used`).
    const span = Math.max(HOUR, signupAgo - lastActiveAgo);
    const successRate = 0.7 + random() * 0.28;
    for (let n = 1; n <= used; n++) {
      const t = signupAgo - Math.floor((n / used) * span);
      const ok = random() < successRate;
      srv(u, "auto_apply_started", t + 2 * MIN, { application_id: `${u}-app-${n}`, plan: "FREE" });
      srv(u, ok ? "auto_apply_success" : "auto_apply_failed", t, {
        application_id: `${u}-app-${n}`,
        ...(ok ? {} : { reason: "form_timeout" }),
      });
      if ([10, 25, 40, 45, 48, 49, 50].includes(n)) {
        srv(u, "auto_apply_milestone", t, { milestone: n, used: n, plan: "FREE" });
      }
    }
    if (used >= 50) srv(u, "auto_apply_blocked", lastActiveAgo + 30 * MIN, { reason: "limit_reached", used: 50 });

    // Intent grows with usage: heavy users look at pricing far more often.
    const intentChance = used >= 45 ? 0.72 : used >= 40 ? 0.5 : used >= 25 ? 0.22 : 0.07;
    if (random() >= intentChance) continue;

    const pricingViews = 1 + Math.floor(random() * 4);
    for (let v = 0; v < pricingViews; v++) {
      browser(u, recent, "pricing_viewed", lastActiveAgo + (v + 1) * 12 * MIN, "/pricing");
    }
    if (random() < 0.55) {
      const premium = random() < 0.4;
      browser(u, recent, premium ? "premium_clicked" : "pro_clicked", lastActiveAgo + 8 * MIN, "/pricing", {
        plan: premium ? "PREMIUM" : "PRO",
      });

      if (random() < 0.45) {
        const sub = `sub_${u}`;
        srv(u, "checkout_started", lastActiveAgo + 20 * MIN, {
          subscription_id: sub,
          plan: premium ? "PREMIUM" : "PRO",
          cycle: "MONTHLY",
          amount: premium ? 99900 : 55900,
          currency: "INR",
        });
        const outcome = random();
        if (outcome < 0.45) {
          srv(u, "payment_success", lastActiveAgo + 18 * MIN, {
            subscription_id: sub,
            razorpay_event: `pay_${u}`,
            current_period_end: at(lastActiveAgo - 30 * DAY),
          });
          srv(u, "subscription_started", lastActiveAgo + 17 * MIN, {
            subscription_id: sub,
            plan: premium ? "PREMIUM" : "PRO",
            subscription_status: "active",
            current_period_end: at(lastActiveAgo - 30 * DAY),
          });
        } else if (outcome < 0.6) {
          srv(u, "payment_failed", lastActiveAgo + 18 * MIN, {
            subscription_id: sub,
            razorpay_event: `fail_${u}`,
            reason: "card_declined",
          });
        }
        // else: checkout started and abandoned - the job derives that.
      }
    }
  }

  return { client, server };
}

async function post(events: Ev[], trusted: boolean) {
  let accepted = 0;
  let duplicates = 0;
  for (let i = 0; i < events.length; i += 500) {
    const res = await fetch(`${BASE_URL}/api/events`, {
      method: "POST",
      headers: trusted
        ? { "content-type": "application/json", "x-api-key": INGEST_KEY }
        : {
            "content-type": "application/json",
            origin: ORIGIN,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
          },
      body: JSON.stringify({ events: events.slice(i, i + 500) }),
    });
    const body = (await res.json()) as { accepted?: number; duplicates?: number; rejected?: unknown[] };
    if (!res.ok || body.rejected?.length) throw new Error(`ingest failed ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
    accepted += body.accepted ?? 0;
    duplicates += body.duplicates ?? 0;
  }
  console.log(`${trusted ? "server" : "client"}: accepted ${accepted}, duplicates ${duplicates}`);
}

if (process.argv[1]?.includes("seed-bulk")) {
  (async () => {
    const { client, server } = buildBulkEvents();
    console.log(`Sending ${server.length} server + ${client.length} browser events for ${USER_COUNT} users...`);
    await post(server, true);
    await post(client, false);
    console.log("Seeded. Now: POST /api/internal/run-rollup then POST /api/internal/run-scoring");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

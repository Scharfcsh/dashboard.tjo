import { z } from "zod";

// ---------------------------------------------------------------------------
// Environment, parsed once. Read lazily so `next build` does not need a database
// URL or keys - the first request (or job) that needs them fails loudly instead.
// ---------------------------------------------------------------------------

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const intWithDefault = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  EVENTS_DATABASE_URL: z.string().min(1, "EVENTS_DATABASE_URL is required"),
  // Every connection starts read-only, so Postgres rejects any write. For
  // pointing a local app at a production database.
  EVENTS_DATABASE_READ_ONLY: bool(false),
  // The product database holding the "User" table (name, email, phone, plan...).
  // Optional: without it lists show user ids. Always opened read-only.
  USER_DETAIL_DB: z.string().trim().optional(),
  // Mask email and phone in every list (SOP 17.2). Turn off only when every
  // viewer is allowed to see contact details.
  PII_MASKING: bool(true),
  // Single-user dashboard sign-in. If any of these is missing, sign-in is
  // treated as not configured and every page stays locked.
  DASHBOARD_EMAIL: z.string().trim().toLowerCase().optional(),
  DASHBOARD_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  INGEST_API_KEY: z.string().min(1, "INGEST_API_KEY is required"),
  ADMIN_API_KEY: z.string().min(1, "ADMIN_API_KEY is required"),
  ALLOWED_ORIGINS: csv,
  BUSINESS_TIMEZONE: z
    .string()
    .default("Asia/Kolkata")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "BUSINESS_TIMEZONE must be a valid IANA timezone"),
  JOBS_ENABLED: bool(false),
  AUTO_ASSIGN_LEADS: bool(false),
  ONLINE_WINDOW_SECONDS: intWithDefault(300),
  SESSION_IDLE_MINUTES: intWithDefault(30),
  // Keyless (browser) ingestion: requests per minute per client IP, per instance.
  INGEST_RATE_LIMIT_PER_MINUTE: intWithDefault(120),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

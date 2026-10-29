// Pure half of the user-detail enrichment, kept free of database imports so it
// can be unit tested.

export interface UserDetail {
  clerkId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  skills: string[];
  username: string | null;
  onboarded: boolean;
  lastSeenAt: Date | null;
  plan: string | null;
  planStatus: string | null;
  billingCycle: string | null;
  currentPeriodEnd: Date | null;
  premiumUntil: Date | null;
  proUntil: Date | null;
  paymentProvider: string | null;
}

/** Which row fields hold the user id and the contact fields to fill. */
export interface DetailKeys {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

const DEFAULT_KEYS = { id: "user_id", name: "name", email: "email", phone: "phone" } as const;

/**
 * Fills name/email/phone from the product database where the analytics row has
 * none. A value already on the row wins. Keys that the row does not carry are
 * left alone, so a `{ user_id, user_name }` row only gains a name. Returns new
 * objects; the input rows are not changed.
 */
export function mergeUserDetails<T extends object>(rows: T[], details: Map<string, UserDetail>, keys: DetailKeys = {}): T[] {
  if (details.size === 0) return rows;
  const k = { ...DEFAULT_KEYS, ...keys };
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = r[k.id];
    const d = typeof id === "string" ? details.get(id) : undefined;
    if (!d) return row;
    const out: Record<string, unknown> = { ...r };
    const fill = (key: string | null, value: string | null) => {
      if (key && key in r && (r[key] === null || r[key] === undefined || r[key] === "") && value) out[key] = value;
    };
    fill(k.name, d.name);
    fill(k.email, d.email);
    fill(k.phone, d.phone);
    return out as T;
  });
}

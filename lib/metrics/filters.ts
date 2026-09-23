import { z } from "zod";

// Dimension filters shared by aggregate endpoints. Always applied against the
// canonical users table (users.country = ISO-2 code, users.acq_source = first touch).

export const userFilterQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "country must be an ISO-3166 alpha-2 code")
    .transform((c) => c.toUpperCase())
    .optional(),
  source: z.string().min(1).max(100).optional(),
});

export type UserFilters = z.infer<typeof userFilterQuerySchema>;

/**
 * SQL predicate (starting with " AND ...") over a users alias. Pushes values to
 * `params` and returns placeholders. Empty string when no filters are set.
 */
export function userFilterSql(filters: UserFilters, params: unknown[], alias = "u"): string {
  let sql = "";
  if (filters.country) {
    params.push(filters.country);
    sql += ` AND ${alias}.country = $${params.length}`;
  }
  if (filters.source) {
    params.push(filters.source);
    sql += ` AND lower(${alias}.acq_source) = lower($${params.length})`;
  }
  return sql;
}

export function filterMeta(filters: UserFilters) {
  return { country: filters.country ?? null, source: filters.source ?? null };
}

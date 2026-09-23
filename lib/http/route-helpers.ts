import { z } from "zod";
import { ApiError } from "@/lib/http/errors";
import { userFilterQuerySchema } from "@/lib/metrics/filters";
import { rangeQuerySchema } from "@/lib/time/business-time";

/** Query schema for date-ranged, filterable aggregate endpoints. */
export const rangeAndFilters = rangeQuerySchema.extend(userFilterQuerySchema.shape);

export const booleanParam = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

/** Route params arrive as a Promise in this Next.js version. */
export async function routeParam<K extends string>(ctx: { params: Promise<Record<K, string>> }, key: K): Promise<string> {
  const value = (await ctx.params)[key];
  if (!value) throw new ApiError("VALIDATION_FAILED", `Missing route parameter ${key}`);
  return decodeURIComponent(value);
}

export const uuidParam = (value: string, what: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError("NOT_FOUND", `${what} not found`);
  }
  return value;
};

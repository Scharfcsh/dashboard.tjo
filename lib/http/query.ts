import type { z } from "zod";

/** Query string as a plain object (last value wins for repeated keys). */
export function searchParamsObject(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

/** Validate the query string against a zod schema (throws ZodError → 400). */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  return schema.parse(searchParamsObject(req));
}

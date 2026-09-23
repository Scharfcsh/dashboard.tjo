import type { SalesFilters, SalesRange } from "@/lib/sales-crm/types";

// URL search params <-> CRM filters. Invalid values fall back to the default
// rather than erroring: a hand-edited URL should still render a workspace.

const RANGES: SalesRange[] = ["today", "7d", "30d"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseSalesFilters(params: Params): SalesFilters {
  const caller = first(params.caller);
  const lead = first(params.lead);
  const range = first(params.range);
  return {
    // A non-id caller or lead is dropped, so it can never reach a query.
    caller: caller && UUID.test(caller) ? caller : null,
    range: RANGES.includes(range as SalesRange) ? (range as SalesRange) : "today",
    lead: lead && UUID.test(lead) ? lead : null,
    status: first(params.status) === "all" ? "all" : "open",
  };
}

import { cohortFields } from "@/lib/dashboards/segments";
import { handler } from "@/lib/http/respond";

// GET /api/cohorts/fields - filterable fields, types and operators for the cohort / rule condition builder.
export const GET = handler(async () => Response.json({ data: cohortFields() }));

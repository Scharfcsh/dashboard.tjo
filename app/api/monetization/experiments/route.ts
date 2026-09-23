import { experimentResults } from "@/lib/experiments/results";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { definitionsFor } from "@/lib/metrics/definitions";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/monetization/experiments?country=&source=
// Free-plan experiment results per variant. Assignment comes from the product's
// server-side `experiment_assigned` events; conversion counts a first payment
// AFTER the user was bucketed. Empty until those events are sent.
export const GET = handler(async (req) => {
  const q = parseQuery(req, userFilterQuerySchema);
  return Response.json({
    data: { experiments: await experimentResults(q) },
    meta: {
      assignment_source: "experiment_assigned events (server-only), first assignment wins",
      confidence: "Two-tailed two-proportion z-test against the control variant.",
    },
    definitions: definitionsFor(["experiment_conversion"]),
  });
});

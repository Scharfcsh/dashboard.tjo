import { handler } from "@/lib/http/respond";
import { requireActor } from "@/lib/sales/actor";
import { autoAssignLeads } from "@/lib/sales/leads";

// POST /api/sales/assign-round-robin
// Distributes every unassigned open lead across active callers by spare capacity.
// Each assignment is its own transaction and writes a sales_assignments row, so a
// partial run is still a consistent one.
export const POST = handler(async (req) => {
  requireActor(req);
  const assigned = await autoAssignLeads();
  return Response.json({
    data: { assigned },
    meta: { strategy: "Capacity-weighted round robin over active callers; leads are taken priority first, oldest first." },
  });
});

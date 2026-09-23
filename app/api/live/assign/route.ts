import { z } from "zod";
import { assignUser } from "@/lib/dashboards/live";
import { handler, readJson } from "@/lib/http/respond";
import { requireActor } from "@/lib/sales/actor";

// POST /api/live/assign   headers: x-actor-id
// Body: { "user_id": "...", "owner_id": "<team member uuid>", "reason"?: "...", "priority"?: "P0"|"P1"|"P2" }
// Reuses the user's open lead (or opens a manual one) and sets its owner. Assignment history + audit recorded.
const schema = z
  .object({
    user_id: z.string().min(1),
    owner_id: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
    priority: z.enum(["P0", "P1", "P2"]).optional(),
  })
  .strict();

export const POST = handler(async (req) => {
  const actor = requireActor(req);
  const input = schema.parse(await readJson(req));
  const result = await assignUser({
    userId: input.user_id,
    ownerId: input.owner_id,
    reason: input.reason ?? null,
    priority: input.priority,
    actor,
  });
  return Response.json({ data: result }, { status: result.lead_created ? 201 : 200 });
});

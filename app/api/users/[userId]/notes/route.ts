import { z } from "zod";
import { audit } from "@/lib/audit";
import { withTransaction } from "@/lib/db/pool";
import { assertUserExists } from "@/lib/dashboards/user360";
import { requireActor } from "@/lib/sales/actor";
import { ApiError } from "@/lib/http/errors";
import { handler, readJson } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";

type Ctx = { params: Promise<{ userId: string }> };

// POST /api/users/:userId/notes   headers: x-actor-id
// Body: { "body": "text", "lead_id"?: uuid }  -> 201 { data: note }
// Append-only: notes are never edited or overwritten.
const schema = z.object({ body: z.string().trim().min(1).max(10_000), lead_id: z.string().uuid().optional() }).strict();

export const POST = handler<Ctx>(async (req, ctx) => {
  const userId = await routeParam(ctx, "userId");
  const actor = requireActor(req);
  const input = schema.parse(await readJson(req));
  await assertUserExists(userId);

  const note = await withTransaction(async (client) => {
    if (input.lead_id) {
      const lead = await client.query("SELECT 1 FROM sales_leads WHERE id = $1 AND user_id = $2", [input.lead_id, userId]);
      if (lead.rowCount === 0) throw new ApiError("VALIDATION_FAILED", "lead_id does not belong to this user");
    }
    const { rows } = await client.query(
      `INSERT INTO sales_activities (lead_id, user_id, actor_id, type, body)
       VALUES ($1, $2, $3, 'note', $4)
       RETURNING id, lead_id, user_id, actor_id, type, body, occurred_at, created_at`,
      [input.lead_id ?? null, userId, actor, input.body]
    );
    await audit({ actorId: actor, action: "note.created", entityType: "user", entityId: userId, metadata: { activity_id: rows[0].id } }, client);
    return rows[0];
  });
  return Response.json({ data: note }, { status: 201 });
});

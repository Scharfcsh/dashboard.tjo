import { queryOne } from "@/lib/db/pool";
import { ApiError } from "@/lib/http/errors";
import { requireActor } from "@/lib/sales/actor";

/**
 * The caller whose queue to show: `owner_id` query param if given (manager view),
 * else x-actor-id. Must be a team member.
 * KNOWN GAP: no RBAC - any key holder can view any caller's queue.
 */
export async function resolveCaller(req: Request, ownerParam?: string): Promise<string> {
  const id = ownerParam ?? requireActor(req);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError("VALIDATION_FAILED", "Caller must be a team member id (x-actor-id header or owner_id param)");
  }
  const member = await queryOne("SELECT 1 FROM team_members WHERE id = $1", [id]);
  if (!member) throw new ApiError("NOT_FOUND", "Team member not found");
  return id;
}

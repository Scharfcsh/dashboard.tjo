import { actorId } from "@/lib/http/auth";
import { ApiError } from "@/lib/http/errors";

/**
 * Mutating sales/support endpoints must name who acted (audit trail, SOP 17.3).
 * KNOWN GAP: taken from the `x-actor-id` header on trust until per-user auth exists.
 */
export function requireActor(req: Request): string {
  const actor = actorId(req.headers);
  if (!actor) throw new ApiError("VALIDATION_FAILED", "x-actor-id header is required for this action");
  if (actor.length > 128) throw new ApiError("VALIDATION_FAILED", "x-actor-id is too long");
  return actor;
}

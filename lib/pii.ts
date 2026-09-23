import { audit } from "@/lib/audit";
import { actorId } from "@/lib/http/auth";

// ---------------------------------------------------------------------------
// PII is masked by default (SOP 17.2). `?reveal_pii=true` returns full values
// and writes an audit_logs row naming the actor and the users revealed.
// KNOWN GAP: without RBAC anyone holding the admin key may reveal.
// ---------------------------------------------------------------------------

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const keep = local!.slice(0, Math.min(2, local!.length));
  return `${keep}${"*".repeat(Math.max(3, local!.length - keep.length))}@${domain}`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  const countryCode = phone.trim().startsWith("+") && digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
  return `${countryCode}******${digits.slice(-4)}`;
}

export function wantsPii(req: Request): boolean {
  return new URL(req.url).searchParams.get("reveal_pii") === "true";
}

export interface PiiFields {
  email: string | null;
  phone: string | null;
}

export function applyPii<T extends PiiFields>(row: T, reveal: boolean): T {
  if (reveal) return row;
  return { ...row, email: maskEmail(row.email), phone: maskPhone(row.phone) };
}

/** Audit a reveal. Call once per response that returned unmasked PII. */
export async function auditPiiReveal(req: Request, userIds: string[], endpoint: string): Promise<void> {
  if (userIds.length === 0) return;
  await audit({
    actorId: actorId(req.headers),
    action: "pii.revealed",
    entityType: "user",
    entityId: userIds.length === 1 ? userIds[0]! : null,
    metadata: { endpoint, user_ids: userIds.slice(0, 500), count: userIds.length },
  });
}

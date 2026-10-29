import "server-only";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";

// The checks every dashboard Server Function makes before it runs. They are
// made here on the server, never trusted from the page.

type Refusal = { ok: false; error: string };

const SIGNED_OUT: Refusal = { ok: false, error: "Your session has expired. Sign in again." };

/** For read-only Server Functions: just the sign-in check. */
export async function sessionRefusal(): Promise<Refusal | null> {
  return (await getSession()) ? null : SIGNED_OUT;
}

/**
 * For Server Functions that write. Refuses when signed out, when the page is
 * showing demo data (nothing real to write to), or when the analytics database
 * is connected read-only.
 */
export async function writeRefusal(what: string, demo: boolean): Promise<Refusal | null> {
  if (!(await getSession())) return SIGNED_OUT;
  if (demo) return { ok: false, error: `${what} is disabled while showing demo data.` };
  if (getConfig().EVENTS_DATABASE_READ_ONLY) {
    return { ok: false, error: `${what} is disabled on a read-only database connection.` };
  }
  return null;
}

/** Whether audit rows can be written (they cannot on a read-only connection). */
export const canWriteAudit = () => !getConfig().EVENTS_DATABASE_READ_ONLY;

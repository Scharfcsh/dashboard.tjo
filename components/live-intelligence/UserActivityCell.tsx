import { TriangleAlert } from "lucide-react";
import { currentAction, hasProductIssue } from "@/lib/live-intelligence/derive";
import type { LiveUser } from "@/lib/live-intelligence/types";
import { cx } from "@/components/ui/tones";

/**
 * Current action. Ordinary activity stays calm (teal); monetization behaviour is
 * emphasised (violet, semibold); repeated failures read as a product problem.
 */
export function UserActivityCell({ user }: { user: LiveUser }) {
  if (hasProductIssue(user)) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-red-50 px-1.5 py-0.5 text-2xs font-semibold text-red-600" title={`${user.autoApplyFailures7d} Auto Apply failures in 7 days — likely a product problem, not a sales lead`}>
        <TriangleAlert className="size-3 shrink-0" aria-hidden />
        {user.autoApplyFailures7d} failures
      </span>
    );
  }
  const action = currentAction(user);
  return (
    <span
      className={cx(
        "inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-2xs",
        action.kind === "monetization" ? "bg-violet-50 font-semibold text-violet-700" : action.kind === "issue" ? "bg-red-50 font-semibold text-red-600" : "bg-teal-50 font-medium text-teal-700"
      )}
      title={action.label}
    >
      {action.label}
    </span>
  );
}

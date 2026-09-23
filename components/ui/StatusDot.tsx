import type { Tone } from "@/lib/revenue-center/types";
import { cx, TONES } from "@/components/ui/tones";

export function StatusDot({ tone = "green", pulse = false, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cx("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      {pulse && <span className={cx("absolute inline-flex size-full animate-ping rounded-full opacity-50", TONES[tone].dot)} />}
      <span className={cx("relative inline-flex size-2 rounded-full", TONES[tone].dot)} />
    </span>
  );
}

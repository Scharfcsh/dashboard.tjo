import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { PqlBand } from "@/lib/pql-intelligence/types";

// Scored unpaid users per band. Bands are the ones the scoring config defines,
// so this panel cannot drift from the scores themselves.

export function PqlDistribution({ bands, total }: { bands: PqlBand[]; total: number }) {
  return (
    <SectionCard
      title="Product Qualified Leads"
      info="Unpaid users with a PQL score, grouped into the bands from the scoring config (Buy Now 90+, Hot 75-89, Warm 60-74, Engaged 40-59, Early below 40). Current state."
      actions={
        <Link
          href="/user-intelligence"
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong"
        >
          View all <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
    >
      {total === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">No users have been scored yet.</p>
      ) : (
        <>
          <p className="tabular mb-2 text-2xs text-slate-500">{formatNumber(total)} scored unpaid users</p>
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={bands.map((b) => `${b.label} ${b.users}`).join(", ")}
          >
            {bands.map((b) =>
              b.users === 0 ? null : (
                <span key={b.category} className={cx("block h-full", TONES[b.tone].solid)} style={{ width: `${(b.users / total) * 100}%` }} />
              )
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {bands.map((b) => (
              <li key={b.category} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <span className={cx("size-2 shrink-0 rounded-full", TONES[b.tone].dot)} aria-hidden />
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="tabular shrink-0 text-2xs text-slate-500">{b.range}</span>
                  <span className={cx("truncate rounded px-1.5 py-0.5 text-2xs font-medium", TONES[b.tone].soft, TONES[b.tone].softText)}>
                    {b.label}
                  </span>
                </span>
                <span className="tabular shrink-0 text-xs font-semibold text-gray-900">
                  {formatNumber(b.users)}
                  <span className="ml-1 font-normal text-slate-400">({formatPercent(b.sharePct, 0)})</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

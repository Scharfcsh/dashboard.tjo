import { ChevronRight, Wallet } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber } from "@/lib/revenue-center/format";
import type { IntentStep } from "@/lib/user-360/types";

export function SubscriptionIntentJourney({ steps, recommendedPlan }: { steps: IntentStep[]; recommendedPlan: string }) {
  return (
    <SectionCard
      title="Subscription Intent Journey"
      info="Pricing → plan click → checkout → payment, from this user's own events."
      actions={<span className="text-2xs text-slate-500">Recommended Plan</span>}
      bodyClassName="pt-1"
    >
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const tone = TONES[step.tone];
          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-stretch">
              {i > 0 && (
                <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden>
                  <ChevronRight className="size-3.5 text-slate-300" />
                </span>
              )}
              <div className={cx("flex min-w-[4.25rem] flex-1 flex-col items-center justify-center rounded-lg border px-1.5 py-2 text-center", step.emphasis ? "border-red-200 bg-red-50" : tone.tile)}>
                <span className={cx("tabular text-base leading-5 font-bold", step.emphasis ? "text-red-600" : "text-gray-900")}>{formatNumber(step.value)}</span>
                <span className={cx("mt-0.5 text-[0.5625rem] leading-3", step.emphasis ? "font-semibold text-red-600" : tone.tileText)}>{step.label}</span>
              </div>
            </div>
          );
        })}
        <div className="flex w-28 shrink-0 flex-col justify-center rounded-lg bg-teal-50 px-2.5 py-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700">
            <Wallet className="size-3.5" aria-hidden /> {recommendedPlan} Plan
          </span>
          <span className="text-[0.5625rem] text-teal-600">Best fit for this user</span>
        </div>
      </div>
    </SectionCard>
  );
}

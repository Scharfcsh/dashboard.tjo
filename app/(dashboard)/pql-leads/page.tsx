import { TriangleAlert } from "lucide-react";
import { ActionBar } from "@/components/pql-intelligence/ActionBar";
import { CriticalSignalCards } from "@/components/pql-intelligence/CriticalSignalCards";
import { ExperimentPanel } from "@/components/pql-intelligence/ExperimentPanel";
import { HotLeadTable } from "@/components/pql-intelligence/HotLeadTable";
import { MarketConversionTable } from "@/components/pql-intelligence/MarketConversionTable";
import { NearLimitCohort } from "@/components/pql-intelligence/NearLimitCohort";
import { PqlDistribution } from "@/components/pql-intelligence/PqlDistribution";
import { PqlHeader } from "@/components/pql-intelligence/PqlHeader";
import { PqlReasonChart } from "@/components/pql-intelligence/PqlReasonChart";
import { TriggerEffectivenessTable } from "@/components/pql-intelligence/TriggerEffectivenessTable";
import { UsageRevenueFunnel } from "@/components/pql-intelligence/UsageRevenueFunnel";
import { UsageStageCards } from "@/components/pql-intelligence/UsageStageCards";
import { NowProvider } from "@/components/ui/Now";
import { parsePqlFilters } from "@/lib/pql-intelligence/filters";
import { loadPqlIntelligence } from "@/lib/pql-intelligence/load";

export const metadata = { title: "PQL & Auto Apply Intelligence · TopJobOffer" };

export default async function PqlLeadsPage({ searchParams }: PageProps<"/pql-leads">) {
  const filters = parsePqlFilters(await searchParams);
  const data = await loadPqlIntelligence(filters);
  const demo = data.source.kind === "demo";

  return (
    <NowProvider initial={data.generatedAt} intervalMs={10_000}>
      <PqlHeader
        filters={data.filters}
        status={data.status}
        generatedAt={data.generatedAt}
        countryOptions={data.countryOptions}
        ownerOptions={data.ownerOptions}
      />

      {data.source.kind === "demo" && (
        <p
          role="note"
          className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {data.source.reason} Numbers below are illustrative, not production values.
        </p>
      )}

      <div className="space-y-3 pb-2">
        <UsageStageCards stages={data.usageStages} usersWithUsage={data.usersWithUsage} filters={data.filters} />
        <CriticalSignalCards signals={data.criticalSignals} filters={data.filters} />

        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_21rem]">
          <UsageRevenueFunnel stages={data.funnel} biggestDropLabel={data.biggestDropLabel} range={data.filters.range} />
          <PqlDistribution bands={data.bands} total={data.totalPqls} />
        </div>

        {/* The queue has fourteen columns and every one matters, so it gets the
            full width; the reason chart moves alongside the cohort panel. */}
        <HotLeadTable rows={data.leads} total={data.leadsTotal} filters={data.filters} demo={demo} />

        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_19rem]">
          <NearLimitCohort users={data.nearLimit} total={data.nearLimitTotal} filters={data.filters} />
          <PqlReasonChart reasons={data.leadReasons} scoredUsers={data.scoredUsers} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[112.5rem]:grid-cols-3">
          <MarketConversionTable markets={data.markets} range={data.filters.range} />
          <TriggerEffectivenessTable triggers={data.triggers} exposureBasis={data.triggerExposureBasis} />
          <div className="md:col-span-2 min-[112.5rem]:col-span-1">
            <ExperimentPanel experiments={data.experiments} />
          </div>
        </div>

        <ActionBar filters={data.filters} leadCount={data.leads.length} demo={demo} />
      </div>
    </NowProvider>
  );
}

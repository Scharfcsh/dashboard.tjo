import { TriangleAlert } from "lucide-react";
import { GrowthChart } from "@/components/dashboard/GrowthChart";
import { IntelligenceMetrics } from "@/components/dashboard/IntelligenceMetrics";
import { KPIGrid } from "@/components/dashboard/KPICard";
import { RevenueAlerts } from "@/components/dashboard/RevenueAlerts";
import { RevenueFunnel } from "@/components/dashboard/RevenueFunnel";
import { RevenueOpportunityTable } from "@/components/dashboard/RevenueOpportunityTable";
import { SalesTeamToday } from "@/components/dashboard/SalesTeamToday";
import { Header } from "@/components/layout/Header";
import { NowProvider } from "@/components/ui/Now";
import { parseDashboardFilters } from "@/lib/revenue-center/filters";
import { loadRevenueCommandCenter } from "@/lib/revenue-center/load";

export const metadata = { title: "Revenue Command Center · TopJobOffer" };

export default async function OverviewPage({ searchParams }: PageProps<"/overview">) {
  const filters = parseDashboardFilters(await searchParams);
  const data = await loadRevenueCommandCenter(filters);
  const demo = data.source.kind === "demo";

  return (
    <NowProvider initial={data.generatedAt}>
      <Header
        title="Revenue Command Center"
        subtitle="Everything happening across users, product activity, conversion and sales today."
        filters={data.filters}
        status={data.status}
        generatedAt={data.generatedAt}
        countryOptions={data.countryOptions}
        sourceOptions={data.sourceOptions}
      />

      {data.source.kind === "demo" && (
        <p role="note" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {data.source.reason} Numbers below are illustrative, not production values.
        </p>
      )}

      <div className="space-y-3">
        <KPIGrid cards={data.kpis} />
        <KPIGrid cards={data.secondaryKpis} variant="secondary" />

        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <RevenueFunnel stages={data.funnel} range={data.filters.funnel} />
          <RevenueAlerts alerts={data.alerts} />
        </div>

        <RevenueOpportunityTable rows={data.opportunities} total={data.opportunitiesTotal} demo={demo} />

        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
          <GrowthChart data={data.growth} days={data.filters.chart} />
          <SalesTeamToday data={data.salesTeam} />
        </div>

        <IntelligenceMetrics metrics={data.intelligence} />
      </div>
    </NowProvider>
  );
}

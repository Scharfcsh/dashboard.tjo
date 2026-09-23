import { LiveDashboard } from "@/components/live-intelligence/LiveDashboard";
import { NowProvider } from "@/components/ui/Now";
import { loadLiveIntelligence } from "@/lib/live-intelligence/load";

export const metadata = { title: "Live User Intelligence · TopJobOffer" };

export default async function LiveUsersPage({ searchParams }: PageProps<"/live-users">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const data = await loadLiveIntelligence(q);
  return (
    <NowProvider initial={data.generatedAt} intervalMs={1_000}>
      <LiveDashboard data={data} />
    </NowProvider>
  );
}

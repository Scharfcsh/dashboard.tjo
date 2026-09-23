import { SalesCrmView } from "@/components/sales-crm/SalesCrmView";
import { NowProvider } from "@/components/ui/Now";
import { parseSalesFilters } from "@/lib/sales-crm/filters";
import { loadSalesCrm } from "@/lib/sales-crm/load";

export const metadata = { title: "Sales Command Center · TopJobOffer" };

export default async function SalesCrmPage({ searchParams }: PageProps<"/sales-crm">) {
  const filters = parseSalesFilters(await searchParams);
  const data = await loadSalesCrm(filters);

  return (
    <NowProvider initial={data.generatedAt} intervalMs={10_000}>
      <SalesCrmView data={data} />
    </NowProvider>
  );
}

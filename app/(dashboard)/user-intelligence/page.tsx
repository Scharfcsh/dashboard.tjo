import { UserDirectory } from "@/components/user-360/UserDirectory";
import { NowProvider } from "@/components/ui/Now";
import { loadDirectory } from "@/lib/user-360/directory";

export const metadata = { title: "User Intelligence · TopJobOffer" };

export default async function UserIntelligencePage({ searchParams }: PageProps<"/user-intelligence">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const data = await loadDirectory(q);
  return (
    <NowProvider initial={data.generatedAt} intervalMs={10_000}>
      <UserDirectory data={data} />
    </NowProvider>
  );
}

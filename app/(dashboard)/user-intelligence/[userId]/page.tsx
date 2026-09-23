import { notFound } from "next/navigation";
import { UserProfileView } from "@/components/user-360/UserProfileView";
import { NowProvider } from "@/components/ui/Now";
import { loadUserProfile } from "@/lib/user-360/load";
import { PROFILE_TABS, type ProfileTab } from "@/lib/user-360/types";

export async function generateMetadata({ params }: PageProps<"/user-intelligence/[userId]">) {
  const { userId } = await params;
  return { title: `${decodeURIComponent(userId)} · User 360 · TopJobOffer` };
}

export default async function UserProfilePage({ params, searchParams }: PageProps<"/user-intelligence/[userId]">) {
  const { userId } = await params;
  const query = await searchParams;
  const data = await loadUserProfile(decodeURIComponent(userId));
  if (!data) notFound();

  const requested = typeof query.tab === "string" ? query.tab : "overview";
  const tab = (PROFILE_TABS as readonly string[]).includes(requested) ? (requested as ProfileTab) : "overview";

  return (
    <NowProvider initial={data.generatedAt} intervalMs={5_000}>
      <UserProfileView data={data} initialTab={tab} />
    </NowProvider>
  );
}

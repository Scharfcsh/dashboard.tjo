import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadShellData } from "@/lib/revenue-center/load";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { openAlertCount } = await loadShellData();
  return <DashboardShell alertCount={openAlertCount}>{children}</DashboardShell>;
}

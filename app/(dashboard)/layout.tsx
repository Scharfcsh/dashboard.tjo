import { DashboardShell } from "@/components/layout/DashboardShell";
import { requireSession } from "@/lib/auth/session";
import { loadShellData } from "@/lib/revenue-center/load";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // proxy.ts already redirects signed-out requests; this repeats the check next
  // to the data in case a matcher change ever stops the proxy covering a page.
  const session = await requireSession();
  const { openAlertCount } = await loadShellData();
  return (
    <DashboardShell alertCount={openAlertCount} email={session.email}>
      {children}
    </DashboardShell>
  );
}

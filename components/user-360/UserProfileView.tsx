"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import {
  addNoteAction,
  assignOwnerAction,
  logContactAction,
  scheduleCallbackAction,
} from "@/app/(dashboard)/user-intelligence/actions";
import { NextBestActionBanner } from "@/components/user-360/NextBestActionBanner";
import { ProfileActionDialog, type DialogKind } from "@/components/user-360/ProfileActionDialog";
import { ProfileHeader } from "@/components/user-360/ProfileHeader";
import { ProfileMetrics } from "@/components/user-360/ProfileMetrics";
import { ProfileTabs } from "@/components/user-360/ProfileTabs";
import { PqlReasonPanel } from "@/components/user-360/PqlReasonPanel";
import { AcquisitionPanel, ProductHealthPanel, ProductUsagePanel } from "@/components/user-360/InfoPanels";
import { SalesEngagementPanel, type SalesAction } from "@/components/user-360/SalesEngagementPanel";
import { SessionJourney } from "@/components/user-360/SessionJourney";
import { SubscriptionIntentJourney } from "@/components/user-360/SubscriptionIntentJourney";
import { ApplicationsTable, RawEventsTab, SalesActivityTab, SubscriptionTab, SupportTab } from "@/components/user-360/TabPanels";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { secondsAgo } from "@/lib/revenue-center/format";
import type { ProfileTab, UserProfileData } from "@/lib/user-360/types";

export function UserProfileView({ data, initialTab }: { data: UserProfileData; initialTab: ProfileTab }) {
  const router = useRouter();
  const now = useNow();
  const demoReason = data.source.kind === "demo" ? data.source.reason : null;
  const demo = demoReason !== null;
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectTab = (next: ProfileTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  const flash = useCallback((tone: "ok" | "error", text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const run = useCallback(
    (work: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
      startTransition(async () => {
        const result = await work();
        if (result.ok) {
          flash("ok", result.message);
          setDialog(null);
          router.refresh();
        } else flash("error", result.error);
      }),
    [flash, router]
  );

  const logContact = (type: "call" | "whatsapp" | "email", outcome?: string) =>
    run(async () => {
      const r = await logContactAction(data.user.userId, type, demo, outcome);
      return r.ok ? { ok: true as const, message: `${type === "call" ? "Call" : type === "whatsapp" ? "WhatsApp" : "Email"} logged for ${data.user.name}.` } : r;
    });

  const headerAction = (action: "call" | "whatsapp" | "email" | "assign" | "note" | "task") => {
    if (action === "assign") setDialog("assign");
    else if (action === "note") setDialog("note");
    else if (action === "task") setDialog("callback");
    else logContact(action);
  };

  const salesAction = (action: SalesAction) => {
    if (action === "assign") setDialog("assign");
    else if (action === "callback") setDialog("callback");
    else if (action === "whatsapp") logContact("whatsapp");
    else logContact("call", action === "start_call" ? "connected" : undefined);
  };

  const submitDialog = (values: { note: string; dueAt: string; ownerId: string }) =>
    run(async () => {
      if (dialog === "note") {
        const r = await addNoteAction(data.user.userId, values.note, demo);
        return r.ok ? { ok: true as const, message: "Note added." } : r;
      }
      if (dialog === "callback") {
        const r = await scheduleCallbackAction(data.user.userId, values.dueAt, values.note, demo);
        return r.ok ? { ok: true as const, message: "Callback scheduled." } : r;
      }
      const r = await assignOwnerAction(data.user.userId, values.ownerId, demo);
      return r.ok ? { ok: true as const, message: `Assigned to ${r.data.ownerName ?? "owner"}.` } : r;
    });

  const overview = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 wide:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,20rem)]">
      <div className="space-y-3">
        <ProductUsagePanel items={data.usage} />
        <AcquisitionPanel items={data.acquisition} />
        <ProductHealthPanel status={data.health.status} items={data.health.items} />
      </div>
      <div className="space-y-3">
        <SessionJourney sessions={data.sessions} nowMs={now} onViewRaw={() => selectTab("raw")} />
        <SubscriptionIntentJourney steps={data.intent.steps} recommendedPlan={data.intent.recommendedPlan} />
      </div>
      <div className="space-y-3">
        <PqlReasonPanel score={data.user.pqlScore} positive={data.pqlSignals.positive} negative={data.pqlSignals.negative} />
        <SalesEngagementPanel sales={data.sales} demo={demo} onAction={salesAction} />
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="User 360 Intelligence Profile" subtitle="Complete behavioural, product and revenue intelligence for one user.">
        <div className="flex items-center gap-3">
          <Link href="/user-intelligence" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-slate-600 hover:text-gray-900">
            <ArrowLeft className="size-3.5" aria-hidden /> All users
          </Link>
          <Tooltip content={demoReason ?? "Profile data refreshes when the pipeline runs."} side="bottom" align="end">
            <span tabIndex={0} className={cx("focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium", demo ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
              <StatusDot tone={demo ? "amber" : "green"} pulse={!demo} />
              {demo ? "Demo data" : "Live Data"}
            </span>
          </Tooltip>
          <span className="tabular hidden text-2xs whitespace-nowrap text-slate-500 lg:inline">Updated {secondsAgo(data.generatedAt, now)}</span>
        </div>
      </PageHeader>

      {demo && (
        <p role="note" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {demoReason} This profile is illustrative.
        </p>
      )}

      <div className="space-y-3">
        <ProfileHeader user={data.user} demo={demo} onAction={headerAction} />
        <NextBestActionBanner user={data.user} />
        <ProfileMetrics metrics={data.metrics} />
        <ProfileTabs active={tab} onSelect={selectTab} />

        {tab === "overview" && overview}
        {tab === "sessions" && <SessionJourney sessions={data.sessions} nowMs={now} onViewRaw={() => selectTab("raw")} />}
        {tab === "applications" && <ApplicationsTable applications={data.applications} />}
        {tab === "subscription" && (
          <div className="space-y-3">
            <SubscriptionIntentJourney steps={data.intent.steps} recommendedPlan={data.intent.recommendedPlan} />
            <SubscriptionTab intent={data.intent} />
          </div>
        )}
        {tab === "sales" && (
          <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <SalesActivityTab activities={data.salesActivities} onAddNote={() => setDialog("note")} demo={demo} />
            <SalesEngagementPanel sales={data.sales} demo={demo} onAction={salesAction} />
          </div>
        )}
        {tab === "support" && <SupportTab support={data.support} />}
        {tab === "raw" && <RawEventsTab userId={data.user.userId} initial={data.rawEvents} demo={demo} />}
      </div>

      <ProfileActionDialog
        kind={dialog}
        userName={data.user.name}
        team={data.team}
        currentOwnerId={data.sales.ownerId}
        pending={pending}
        onClose={() => setDialog(null)}
        onSubmit={submitDialog}
      />

      {toast && (
        <p role="status" className={cx("fixed right-5 bottom-5 z-[70] animate-fade-in rounded-lg px-3.5 py-2.5 text-xs font-medium text-white shadow-pop", toast.tone === "ok" ? "bg-gray-900" : "bg-red-600")}>
          {toast.text}
        </p>
      )}
    </>
  );
}

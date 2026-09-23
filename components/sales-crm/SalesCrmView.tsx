"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { CallNextCard } from "@/components/sales-crm/CallNextCard";
import { CallerKpis } from "@/components/sales-crm/CallerKpis";
import { CallerLeaderboard } from "@/components/sales-crm/CallerLeaderboard";
import { CompleteCallPanel, type DispositionSubmission } from "@/components/sales-crm/CompleteCallPanel";
import { FollowUpTimeline } from "@/components/sales-crm/FollowUpTimeline";
import { LeadDetailRail } from "@/components/sales-crm/LeadDetailRail";
import { LeadPoolBar } from "@/components/sales-crm/LeadPoolBar";
import { MyLeadsTable } from "@/components/sales-crm/MyLeadsTable";
import { PipelineStrip } from "@/components/sales-crm/PipelineStrip";
import { ResponseSlaPanel } from "@/components/sales-crm/ResponseSlaPanel";
import { SalesHeader } from "@/components/sales-crm/SalesHeader";
import { cx } from "@/components/ui/tones";
import {
  addNoteAction,
  logContactAction,
  revealContactAction,
  runRoundRobinAction,
  setDispositionAction,
} from "@/app/(dashboard)/sales-crm/actions";
import { RANGE_LABELS } from "@/lib/sales-crm/derive";
import type { QueueLead, SalesCrmData } from "@/lib/sales-crm/types";

// Client orchestrator: selection, contact actions and outcomes. Every write
// goes through a Server Function and is followed by router.refresh(), so what
// the page shows is always what the database says.

type ContactType = "call" | "whatsapp" | "email";

export function SalesCrmView({ data }: { data: SalesCrmData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const demo = data.source.kind === "demo";

  const show = useCallback((text: string, tone: "ok" | "error") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const selectLead = useCallback(
    (leadId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("lead", leadId);
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  const selectedLeadId = data.selectedLead?.leadId ?? null;
  const selectedQueueLead: QueueLead | null =
    data.queue.find((l) => l.leadId === selectedLeadId) ??
    (data.callNext && data.callNext.leadId === selectedLeadId ? data.callNext : null);

  /**
   * Hands the caller the real number or address, opens the device's own
   * handler, and logs the attempt. The reveal is audited server-side; the page
   * itself never holds an unmasked value.
   */
  const contact = (leadId: string, name: string, type: ContactType) =>
    startTransition(async () => {
      const revealed = await revealContactAction(leadId, data.caller.id, demo);
      if (!revealed.ok) {
        show(revealed.error, "error");
        return;
      }
      const { phone, email } = revealed.data;
      const target =
        type === "call"
          ? phone && `tel:${phone.replace(/[^+\d]/g, "")}`
          : type === "whatsapp"
            ? phone && `https://wa.me/${phone.replace(/[^\d]/g, "")}`
            : email && `mailto:${email}`;

      if (!target) {
        show(`No ${type === "email" ? "email address" : "phone number"} on file for ${name}.`, "error");
        return;
      }
      window.open(target, type === "whatsapp" ? "_blank" : "_self");

      const logged = await logContactAction(leadId, data.caller.id, { type }, demo);
      if (!logged.ok) {
        show(logged.error, "error");
        return;
      }
      selectLead(leadId);
      show(
        logged.data.dispositionRequired
          ? `Call logged. Record the outcome for ${name} to clear it.`
          : `${type === "call" ? "Call" : type === "whatsapp" ? "WhatsApp" : "Email"} logged for ${name}.`,
        "ok"
      );
      router.refresh();
    });

  const completeCall = (values: DispositionSubmission) => {
    if (!selectedLeadId) return;
    startTransition(async () => {
      const result = await setDispositionAction(
        selectedLeadId,
        data.caller.id,
        {
          disposition: values.disposition,
          notes: values.notes || undefined,
          callbackAt: values.callbackAt ?? undefined,
          objection: values.objection || undefined,
          durationSeconds: values.durationSeconds ?? undefined,
          recommendedPlan: values.recommendedPlan || undefined,
        },
        demo
      );
      if (!result.ok) {
        show(result.error, "error");
        return;
      }
      show(
        result.data.closed
          ? `Lead closed as ${result.data.status}. It has left your open queue.`
          : `Outcome saved. Lead is now ${result.data.status}.`,
        "ok"
      );
      router.refresh();
    });
  };

  const addNote = (body: string) => {
    if (!selectedLeadId || body.trim().length === 0) return;
    startTransition(async () => {
      const result = await addNoteAction(selectedLeadId, data.caller.id, body, demo);
      if (!result.ok) {
        show(result.error, "error");
        return;
      }
      show("Note saved.", "ok");
      router.refresh();
    });
  };

  const assignLeads = () =>
    startTransition(async () => {
      const result = await runRoundRobinAction(data.caller.id, demo);
      if (!result.ok) {
        show(result.error, "error");
        return;
      }
      show(
        result.data.assigned === 0
          ? "Nothing to assign — every open lead already has an owner, or every caller is at capacity."
          : `Assigned ${result.data.assigned} lead${result.data.assigned === 1 ? "" : "s"} across active callers.`,
        "ok"
      );
      router.refresh();
    });

  return (
    <>
      <SalesHeader
        caller={data.caller}
        callerOptions={data.callerOptions}
        range={data.filters.range}
        openAlerts={data.openAlerts}
      />

      {data.source.kind === "demo" && (
        <p
          role="note"
          className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {data.source.reason} Leads below are illustrative, and contact actions are disabled.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-3">
          <CallerKpis kpis={data.kpis} />
          <LeadPoolBar segments={data.poolSegments} activeUsers={data.poolActiveUsers} />

          {/* A manager is not in the round robin, so their own queue is usually
              empty: team health is what they came for, and it goes first. */}
          {data.caller.isManager && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <CallerLeaderboard rows={data.leaderboard} rangeLabel={RANGE_LABELS[data.filters.range]} />
              <ResponseSlaPanel
                metrics={data.sla}
                unassignedOpenLeads={data.unassignedOpenLeads}
                demo={demo}
                busy={pending}
                onAssign={assignLeads}
              />
            </div>
          )}

          {data.callNext ? (
            <CallNextCard
              lead={data.callNext}
              demo={demo}
              busy={pending}
              onContact={(type) => contact(data.callNext!.leadId, data.callNext!.name, type)}
            />
          ) : (
            <EmptyQueue
              unassigned={data.unassignedOpenLeads}
              isManager={data.caller.isManager}
              demo={demo}
              busy={pending}
              onAssign={assignLeads}
            />
          )}

          <MyLeadsTable
            leads={data.queue}
            total={data.queueTotal}
            selectedLeadId={selectedLeadId}
            demo={demo}
            busy={pending}
            onSelect={selectLead}
            onContact={(lead, type) => contact(lead.leadId, lead.name, type)}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <CompleteCallPanel lead={selectedQueueLead} demo={demo} busy={pending} onSubmit={completeCall} />
            <FollowUpTimeline followUps={data.followUps} onSelect={selectLead} />
          </div>

          <PipelineStrip stages={data.pipeline} total={data.pipelineTotal} />

        </div>

        <div className="min-w-0 wide:sticky wide:top-4 wide:self-start">
          <LeadDetailRail
            lead={data.selectedLead}
            demo={demo}
            busy={pending}
            onCall={() => data.selectedLead && contact(data.selectedLead.leadId, data.selectedLead.name, "call")}
            onAddNote={addNote}
          />
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed right-5 bottom-5 z-[70] max-w-sm animate-fade-in rounded-lg px-3.5 py-2.5 text-xs font-medium shadow-pop",
            toast.tone === "ok" ? "bg-gray-900 text-white" : "bg-red-600 text-white"
          )}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}

/** A caller with nothing assigned needs to know why, and a manager needs the fix. */
function EmptyQueue({
  unassigned,
  isManager,
  demo,
  busy,
  onAssign,
}: {
  unassigned: number;
  isManager: boolean;
  demo: boolean;
  busy: boolean;
  onAssign: () => void;
}) {
  return (
    <section className="card px-4 py-8 text-center">
      <h2 className="text-sm font-semibold text-gray-900">Your queue is empty</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
        {unassigned > 0
          ? `${unassigned} open ${unassigned === 1 ? "lead is" : "leads are"} waiting with no owner.${
              isManager ? " Assign them across the team to start calling." : " Ask your manager to assign them."
            }`
          : isManager
            ? "Round robin assigns leads to callers, not managers — switch to a caller above to see a working queue."
            : "No open leads are waiting. New ones appear automatically as users hit buying signals."}
      </p>
      {isManager && unassigned > 0 && (
        <button
          type="button"
          onClick={onAssign}
          disabled={demo || busy}
          className="focus-ring mt-3 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Assigning…" : `Assign ${unassigned} leads across the team`}
        </button>
      )}
    </section>
  );
}

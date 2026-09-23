"use client";

import { useState } from "react";
import { CircleAlert, PhoneOff } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx, TONES } from "@/components/ui/tones";
import { DISPOSITION_META, parseDurationInput } from "@/lib/sales-crm/derive";
import type { Disposition } from "@/lib/dashboards/sales";
import type { QueueLead } from "@/lib/sales-crm/types";

export interface DispositionSubmission {
  disposition: Disposition;
  notes: string;
  callbackAt: string | null;
  objection: string;
  durationSeconds: number | null;
  recommendedPlan: string;
}

const OBJECTIONS = ["", "Too expensive", "Comparing plans", "Needs manager approval", "Not job hunting now", "Product concern", "Payment problem"];
const PLANS = ["", "Pro", "Premium"];

/**
 * Completing a call is a required step, not an optional one: a connected call
 * leaves the lead flagged until an outcome is recorded (SOP 12). The panel
 * refuses to submit a Callback without a time, because the API would reject it
 * and the caller would lose what they typed.
 */
export function CompleteCallPanel({
  lead,
  demo,
  busy,
  onSubmit,
}: {
  lead: QueueLead | null;
  demo: boolean;
  busy: boolean;
  onSubmit: (values: DispositionSubmission) => void;
}) {
  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [objection, setObjection] = useState("");
  const [plan, setPlan] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meta = DISPOSITION_META.find((d) => d.value === disposition);
  const needsCallback = meta?.requiresCallback ?? false;
  const field =
    "focus-ring h-8 w-full rounded-lg border border-line bg-white px-2.5 text-xs text-slate-700 shadow-card disabled:bg-slate-50 disabled:text-slate-400";

  const reset = () => {
    setDisposition(null);
    setDuration("");
    setNotes("");
    setObjection("");
    setPlan("");
    setDate("");
    setTime("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!disposition) return setError("Pick an outcome first.");
    const seconds = parseDurationInput(duration);
    if (duration.trim() !== "" && seconds === null) return setError("Call duration must look like 4:35 or 275.");

    let callbackAt: string | null = null;
    if (needsCallback) {
      if (!date || !time) return setError("A callback needs both a date and a time.");
      const when = new Date(`${date}T${time}`);
      if (Number.isNaN(when.getTime())) return setError("That follow-up date and time is not valid.");
      if (when.getTime() < Date.now()) return setError("The follow-up time is in the past.");
      callbackAt = when.toISOString();
    }
    onSubmit({ disposition, notes, callbackAt, objection, durationSeconds: seconds, recommendedPlan: plan });
    reset();
  };

  if (!lead) {
    return (
      <SectionCard title="Complete Call" info="Record what happened on a call. Pick a lead from the queue first.">
        <p className="py-8 text-center text-xs text-slate-500">Select a lead to record a call outcome.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Complete Call"
      info="Recording an outcome is required after a connected call. The outcome drives what happens next: a callback creates a reminder, Needs Support raises a support handoff, Not Interested suppresses the user for 30 days, and Converted closes the lead."
      actions={<span className="truncate text-2xs text-slate-500">{lead.name}</span>}
    >
      {lead.pendingDisposition && (
        <p role="alert" className="mb-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-2xs text-amber-800">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          A connected call on this lead has no outcome yet. Record one to clear it.
        </p>
      )}

      <fieldset disabled={demo || busy} className="min-w-0">
        <legend className="sr-only">Call outcome</legend>
        <ul className="flex flex-wrap gap-1.5">
          {DISPOSITION_META.map((d) => {
            const active = disposition === d.value;
            const tone = TONES[d.tone];
            return (
              <li key={d.value}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDisposition(active ? null : d.value)}
                  className={cx(
                    "focus-ring rounded-md px-2 py-1 text-2xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    active ? cx(tone.solid, "text-white") : cx(tone.soft, tone.softText, "hover:brightness-95")
                  )}
                >
                  {d.label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 grid grid-cols-2 gap-2.5 wide:grid-cols-3">
          <label className="block text-2xs font-medium text-slate-600">
            Call duration
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="mm:ss"
              inputMode="numeric"
              className={cx(field, "mt-1")}
            />
          </label>
          <label className="block text-2xs font-medium text-slate-600">
            Objection
            <select value={objection} onChange={(e) => setObjection(e.target.value)} className={cx(field, "mt-1 cursor-pointer")}>
              {OBJECTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "None"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-2xs font-medium text-slate-600">
            Recommended plan
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={cx(field, "mt-1 cursor-pointer")}>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p || "Not discussed"}
                </option>
              ))}
            </select>
          </label>
          <label className={cx("block text-2xs font-medium", needsCallback ? "text-slate-600" : "text-slate-400")}>
            Follow-up date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={!needsCallback || demo || busy}
              className={cx(field, "mt-1")}
            />
          </label>
          <label className={cx("block text-2xs font-medium", needsCallback ? "text-slate-600" : "text-slate-400")}>
            Follow-up time
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!needsCallback || demo || busy}
              className={cx(field, "mt-1")}
            />
          </label>
          <label className="col-span-2 block text-2xs font-medium text-slate-600 wide:col-span-1">
            Notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did they say?"
              maxLength={10_000}
              className={cx(field, "mt-1")}
            />
          </label>
        </div>
      </fieldset>

      {error && <p className="mt-2 text-2xs text-red-600">{error}</p>}
      {meta?.closesLead && (
        <p className="mt-2 flex items-center gap-1.5 text-2xs text-slate-500">
          <PhoneOff className="size-3 shrink-0" aria-hidden />
          {meta.value === "converted"
            ? "This closes the lead as converted."
            : "This closes the lead and stops outreach to this user for 30 days."}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="focus-ring inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={demo || busy || !disposition}
          className="focus-ring inline-flex h-8 items-center rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save outcome"}
        </button>
      </div>
    </SectionCard>
  );
}

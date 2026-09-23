"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { FilterOption } from "@/lib/revenue-center/types";

export type DialogKind = "note" | "callback" | "assign" | null;

const TITLES: Record<Exclude<DialogKind, null>, string> = {
  note: "Add a note",
  callback: "Schedule a callback",
  assign: "Assign this lead",
};

/** One small modal for the three write actions that need input. */
export function ProfileActionDialog({
  kind,
  userName,
  team,
  currentOwnerId,
  pending,
  onClose,
  onSubmit,
}: {
  kind: DialogKind;
  userName: string;
  team: FilterOption[];
  currentOwnerId: string | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: { note: string; dueAt: string; ownerId: string }) => void;
}) {
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 16));
  const [ownerId, setOwnerId] = useState(currentOwnerId ?? "");
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!kind) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind]);

  if (!kind) return null;
  const valid = kind === "note" ? note.trim().length > 0 : kind === "callback" ? Boolean(dueAt) : Boolean(ownerId);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-gray-900/30" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit({ note, dueAt: dueAt ? new Date(dueAt).toISOString() : "", ownerId });
        }}
        className="relative w-full max-w-md animate-fade-in rounded-xl border border-line bg-white shadow-pop"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="profile-dialog-title" className="text-sm font-semibold text-gray-900">
            {TITLES[kind]} · {userName}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {kind === "note" && (
            <label className="block">
              <span className="mb-1 block text-2xs font-medium text-slate-600">Note</span>
              <textarea
                autoFocus
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={10_000}
                placeholder="What did you learn about this user?"
                className="focus-ring w-full rounded-lg border border-line px-2.5 py-2 text-xs"
              />
            </label>
          )}
          {kind === "callback" && (
            <>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium text-slate-600">Call back at</span>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="focus-ring h-9 w-full rounded-lg border border-line px-2.5 text-xs" />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium text-slate-600">Notes (optional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="focus-ring h-9 w-full rounded-lg border border-line px-2.5 text-xs" />
              </label>
            </>
          )}
          {kind === "assign" && (
            <label className="block">
              <span className="mb-1 block text-2xs font-medium text-slate-600">Sales owner</span>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="focus-ring h-9 w-full rounded-lg border border-line px-2 text-xs">
                <option value="">Select owner…</option>
                {team.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="focus-ring h-8 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button type="submit" disabled={!valid || pending} className="focus-ring h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

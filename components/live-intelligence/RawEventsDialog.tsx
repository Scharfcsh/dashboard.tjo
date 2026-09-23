"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { LiveSession } from "@/lib/live-intelligence/types";

/** Secondary, for support/engineering: the session's events with their properties. */
export function RawEventsDialog({ session, name, onClose }: { session: LiveSession; name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="raw-events-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-gray-900/30" />
      <div className="relative flex max-h-[80vh] w-full max-w-2xl animate-fade-in flex-col rounded-xl border border-line bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id="raw-events-title" className="text-sm font-semibold text-gray-900">
            Raw events · {name}
            <span className="ml-2 font-normal text-slate-500">{session.events.length} events</span>
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="divide-y divide-slate-100 overflow-y-auto">
          {session.events.map((e) => (
            <li key={e.id} className="px-5 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-gray-900">{e.eventName}</span>
                <time dateTime={e.at} className="tabular text-2xs text-slate-400">
                  {new Date(e.at).toLocaleString("en-IN")}
                </time>
              </div>
              {e.page && <div className="text-2xs text-slate-500">{e.page}</div>}
              {Object.keys(e.properties).length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-2xs text-slate-500 hover:text-gray-900">Properties</summary>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-slate-50 p-2 text-[0.625rem] text-slate-700">{JSON.stringify(e.properties, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

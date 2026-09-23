import { cx, TONES } from "@/components/ui/tones";
import type { LiveSession } from "@/lib/live-intelligence/types";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

/** Chronological product activity; monetization steps are emphasised. */
export function SessionTimeline({ events }: { events: LiveSession["events"] }) {
  if (events.length === 0) return <p className="py-2 text-xs text-slate-500">No events recorded in this session yet.</p>;
  return (
    <ol className="relative space-y-2 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-slate-200">
      {events.map((e) => (
        <li key={e.id} className="relative flex gap-2.5 pl-4">
          <span className={cx("absolute top-[0.3125rem] left-0 size-[7px] rounded-full ring-2 ring-white", TONES[e.tone].dot)} aria-hidden />
          <time dateTime={e.at} className="tabular w-[4.5rem] shrink-0 text-[0.625rem] leading-4 text-slate-400">
            {time(e.at)}
          </time>
          <span className={cx("min-w-0 text-2xs leading-4", e.monetization ? "font-semibold text-amber-700" : "text-gray-800")} title={e.detail ?? undefined}>
            {e.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

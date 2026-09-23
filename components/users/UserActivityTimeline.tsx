import type { TimelineEvent } from "@/lib/revenue-center/types";
import { cx, TONES } from "@/components/ui/tones";
import { formatEventTime, relativeTime } from "@/lib/revenue-center/format";

export function UserActivityTimeline({ events, now }: { events: TimelineEvent[]; now: number }) {
  if (events.length === 0) {
    return <p className="py-3 text-xs text-slate-500">No recent activity recorded in this session.</p>;
  }
  return (
    <ol className="relative space-y-3 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-slate-200">
      {events.map((e) => (
        <li key={e.id} className="relative flex gap-3 pl-4">
          <span className={cx("absolute top-1.5 left-0 size-[7px] rounded-full ring-2 ring-white", TONES[e.tone].dot)} aria-hidden />
          <time dateTime={e.at} title={relativeTime(e.at, now)} className="tabular w-[6.5rem] shrink-0 whitespace-nowrap text-2xs leading-5 text-slate-400">
            {formatEventTime(e.at, now)}
          </time>
          <div className="min-w-0">
            <p className="text-xs leading-5 font-medium text-gray-900">{e.label}</p>
            {e.detail && <p className="truncate text-2xs text-slate-500">{e.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

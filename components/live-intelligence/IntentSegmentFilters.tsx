import { cx, TONES } from "@/components/ui/tones";
import { INTENT_FILTERS, SEGMENT_FILTERS, SEGMENT_META } from "@/lib/live-intelligence/derive";
import type { IntentFilter, UserSegment } from "@/lib/live-intelligence/types";
import type { Tone } from "@/lib/revenue-center/types";

function Chip({ label, tone, active, onClick }: { label: string; tone: Tone; active: boolean; onClick: () => void }) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "focus-ring rounded-md px-2 py-1 text-2xs font-medium transition-[box-shadow,background-color]",
        t.soft,
        t.softText,
        active ? "ring-2 ring-offset-1 ring-current" : "hover:ring-1 hover:ring-current/30"
      )}
    >
      {label}
    </button>
  );
}

export function IntentSegmentFilters({
  intents,
  segments,
  onToggleIntent,
  onToggleSegment,
}: {
  intents: IntentFilter[];
  segments: UserSegment[];
  onToggleIntent: (k: IntentFilter) => void;
  onToggleSegment: (s: UserSegment) => void;
}) {
  return (
    <section aria-label="Intent filters and user segments" className="card flex min-w-0 flex-col px-4 py-3.5">
      <h2 className="text-sm font-semibold text-gray-900">Intent Filters</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {INTENT_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} tone={f.tone} active={intents.includes(f.key)} onClick={() => onToggleIntent(f.key)} />
        ))}
      </div>
      <h2 className="mt-3.5 text-sm font-semibold text-gray-900">User Segments</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SEGMENT_FILTERS.map((s) => (
          <Chip key={s} label={SEGMENT_META[s].label} tone={SEGMENT_META[s].tone} active={segments.includes(s)} onClick={() => onToggleSegment(s)} />
        ))}
      </div>
    </section>
  );
}

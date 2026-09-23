"use client";

import { cx } from "@/components/ui/tones";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "focus-ring min-w-10 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              active ? "bg-brand text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/tones";

export function FilterSelect({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("relative inline-flex items-center", className)}>
      <span className="sr-only">{label}</span>
      {Icon && <Icon className="pointer-events-none absolute left-2.5 size-3.5 text-slate-500" aria-hidden />}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "focus-ring h-8 w-full cursor-pointer appearance-none truncate rounded-lg border border-line bg-white pr-7 text-xs font-medium text-slate-700 shadow-card transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60",
          Icon ? "pl-8" : "pl-2.5"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-slate-400" aria-hidden />
    </label>
  );
}

import type { ReactNode } from "react";
import type { Tone } from "@/lib/revenue-center/types";
import { cx, TONES } from "@/components/ui/tones";

export function Badge({
  tone = "slate",
  children,
  size = "md",
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cx(
        "inline-block whitespace-nowrap rounded-md font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-xs",
        t.soft,
        t.softText,
        className
      )}
    >
      {children}
    </span>
  );
}

"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/components/ui/tones";

/**
 * CSS-only tooltip: shows on hover and on keyboard focus within the trigger.
 * The trigger element should itself be focusable (button, link) for keyboard users.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cx("group/tip relative inline-flex", className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cx(
          "pointer-events-none absolute z-50 w-max max-w-64 rounded-md bg-gray-900 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-white opacity-0 shadow-pop transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0"
        )}
      >
        {content}
      </span>
    </span>
  );
}

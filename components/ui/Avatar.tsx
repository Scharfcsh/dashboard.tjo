import { initials } from "@/lib/revenue-center/format";
import { cx } from "@/components/ui/tones";

const PALETTE = [
  "bg-teal-50 text-teal-700",
  "bg-indigo-50 text-indigo-700",
  "bg-violet-50 text-violet-700",
  "bg-sky-50 text-sky-700",
  "bg-amber-50 text-amber-700",
  "bg-rose-50 text-rose-700",
  "bg-slate-100 text-slate-700",
];

function paletteFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/5",
        size === "sm" && "size-6 text-2xs",
        size === "md" && "size-7 text-2xs",
        size === "lg" && "size-12 text-base",
        paletteFor(name),
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

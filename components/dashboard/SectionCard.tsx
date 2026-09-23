import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";

export function SectionCard({
  title,
  info,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: string;
  info?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const headingId = `${id ?? title.replace(/\W+/g, "-").toLowerCase()}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className={cx("card flex min-w-0 flex-col", className)}>
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 id={headingId} className="truncate text-sm font-semibold text-gray-900">
            {title}
          </h2>
          {info && (
            <Tooltip content={info} align="start">
              <button type="button" aria-label={`About ${title}`} className="focus-ring rounded-full text-slate-400 hover:text-slate-600">
                <Info className="size-3.5" aria-hidden />
              </button>
            </Tooltip>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cx("min-h-0 flex-1 px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  );
}

import type { ReactNode } from "react";

/** Shared page header: title + subtitle on the left, page controls on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pb-4 wide:flex-row wide:items-center wide:justify-between">
      <div className="min-w-0 wide:shrink">
        <h1 className="text-[1.375rem] font-semibold leading-7 tracking-tight text-gray-900">{title}</h1>
        <p className="mt-0.5 truncate text-xs text-slate-500" title={subtitle}>
          {subtitle}
        </p>
      </div>
      {children}
    </header>
  );
}

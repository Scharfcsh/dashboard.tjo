import { BriefcaseBusiness } from "lucide-react";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
        <BriefcaseBusiness className="size-4.5" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-[1.0625rem] font-bold tracking-tight text-gray-900">
        TopJobOffer
      </span>
    </span>
  );
}

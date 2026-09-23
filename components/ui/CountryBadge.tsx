import { countryName, flagEmoji } from "@/lib/revenue-center/format";

export function CountryBadge({ code }: { code: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate whitespace-nowrap text-slate-600">
      <span className="text-sm leading-none" aria-hidden>
        {flagEmoji(code)}
      </span>
      {countryName(code)}
    </span>
  );
}

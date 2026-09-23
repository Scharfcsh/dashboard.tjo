import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PLACEHOLDER_SECTIONS } from "@/components/layout/nav";

// Nav destinations for dashboards that are not built yet.
export default async function SectionPlaceholder({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const label = PLACEHOLDER_SECTIONS.get(section);
  if (!label) notFound();
  return (
    <div className="card mx-auto mt-16 max-w-md px-6 py-10 text-center">
      <h1 className="text-lg font-semibold text-gray-900">{label}</h1>
      <p className="mt-2 text-sm text-slate-500">This workspace is part of the TopJobOffer Revenue OS roadmap and is not available yet.</p>
      <Link href="/overview" className="focus-ring mt-5 inline-flex items-center gap-1 rounded text-sm font-medium text-brand hover:text-brand-strong">
        Back to Revenue Command Center <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

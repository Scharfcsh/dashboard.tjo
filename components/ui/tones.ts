import type { Tone } from "@/lib/revenue-center/types";

// Static class strings per semantic tone (Tailwind needs literal class names).
export interface ToneClasses {
  text: string;
  soft: string;
  softText: string;
  solid: string;
  dot: string;
  ring: string;
  tile: string;
  tileText: string;
  stroke: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  teal: { text: "text-teal-600", soft: "bg-teal-50", softText: "text-teal-700", solid: "bg-teal-600", dot: "bg-teal-500", ring: "ring-teal-200", tile: "bg-teal-50 border-teal-100", tileText: "text-teal-700", stroke: "#0d9488" },
  blue: { text: "text-blue-500", soft: "bg-blue-50", softText: "text-blue-700", solid: "bg-blue-500", dot: "bg-blue-500", ring: "ring-blue-200", tile: "bg-blue-50 border-blue-100", tileText: "text-blue-700", stroke: "#3b82f6" },
  indigo: { text: "text-indigo-500", soft: "bg-indigo-50", softText: "text-indigo-700", solid: "bg-indigo-500", dot: "bg-indigo-500", ring: "ring-indigo-200", tile: "bg-indigo-50 border-indigo-100", tileText: "text-indigo-700", stroke: "#6366f1" },
  purple: { text: "text-violet-500", soft: "bg-violet-50", softText: "text-violet-700", solid: "bg-violet-500", dot: "bg-violet-500", ring: "ring-violet-200", tile: "bg-violet-50 border-violet-100", tileText: "text-violet-700", stroke: "#8b5cf6" },
  amber: { text: "text-amber-500", soft: "bg-amber-50", softText: "text-amber-700", solid: "bg-amber-500", dot: "bg-amber-500", ring: "ring-amber-200", tile: "bg-amber-50 border-amber-100", tileText: "text-amber-700", stroke: "#f59e0b" },
  orange: { text: "text-orange-500", soft: "bg-orange-50", softText: "text-orange-700", solid: "bg-orange-500", dot: "bg-orange-500", ring: "ring-orange-200", tile: "bg-orange-50 border-orange-100", tileText: "text-orange-700", stroke: "#f97316" },
  red: { text: "text-red-500", soft: "bg-red-50", softText: "text-red-600", solid: "bg-red-500", dot: "bg-red-500", ring: "ring-red-200", tile: "bg-red-50 border-red-100", tileText: "text-red-600", stroke: "#ef4444" },
  green: { text: "text-emerald-500", soft: "bg-emerald-50", softText: "text-emerald-700", solid: "bg-emerald-500", dot: "bg-emerald-500", ring: "ring-emerald-200", tile: "bg-emerald-50 border-emerald-100", tileText: "text-emerald-700", stroke: "#10b981" },
  slate: { text: "text-slate-500", soft: "bg-slate-100", softText: "text-slate-600", solid: "bg-slate-600", dot: "bg-slate-400", ring: "ring-slate-200", tile: "bg-slate-50 border-slate-200", tileText: "text-slate-700", stroke: "#64748b" },
};

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

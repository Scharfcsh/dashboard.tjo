"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createAlertAction } from "@/app/(dashboard)/live-users/actions";
import { ActiveUsersTable, type RowAction } from "@/components/live-intelligence/ActiveUsersTable";
import { FeatureUsage } from "@/components/live-intelligence/FeatureUsage";
import { ImportantEventsStream } from "@/components/live-intelligence/ImportantEventsStream";
import { IntentSegmentFilters } from "@/components/live-intelligence/IntentSegmentFilters";
import { LiveFilters } from "@/components/live-intelligence/LiveFilters";
import { LiveHeader } from "@/components/live-intelligence/LiveHeader";
import { LiveKPIGrid, type KpiAction } from "@/components/live-intelligence/LiveKPIGrid";
import { LiveSessionPreview } from "@/components/live-intelligence/LiveSessionPreview";
import { SessionDistribution } from "@/components/live-intelligence/SessionDistribution";
import { User360Drawer, type DrawerIntent } from "@/components/users/User360Drawer";
import { applyLiveFilters, DEFAULT_FILTERS, INTENT_FILTERS, rankLiveUsers, SEGMENT_FILTERS, type LiveFilterState } from "@/lib/live-intelligence/derive";
import { MOCK_EVENT_POOL } from "@/lib/live-intelligence/event-pool";
import type { IntentFilter, LiveEvent, LiveIntelligenceData, LiveUser, UserSegment } from "@/lib/live-intelligence/types";

// ---------------------------------------------------------------------------
// Client orchestrator for Live User Intelligence: filter state (mirrored into the
// URL so views are shareable), row selection, User 360, and liveness - polling
// the server in live mode, a gentle simulation in demo mode.
// ---------------------------------------------------------------------------

const POLL_MS = 20_000;
const SIMULATE_MS = 8_000;
const ONLINE_WALK = [0, 1, 0, -1, 0, 1, -1, 0];

const LIST = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

function filtersFromParams(p: URLSearchParams): LiveFilterState {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = p.get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };
  const intents = INTENT_FILTERS.map((i) => i.key);
  return {
    status: pick("status", ["all", "online", "idle"] as const, DEFAULT_FILTERS.status),
    window: pick("window", ["today", "7d"] as const, DEFAULT_FILTERS.window),
    recency: pick("recency", ["any", "15m", "1h", "24h"] as const, DEFAULT_FILTERS.recency),
    country: p.get("country") ?? "",
    segment: pick<UserSegment | "">("segment", ["", ...SEGMENT_FILTERS], ""),
    plan: p.get("plan") ?? "",
    intent: pick<IntentFilter | "">("intent", ["", ...intents], ""),
    pql: pick("pql", ["any", "90", "80", "60-89", "lt60"] as const, "any"),
    source: p.get("source") ?? "",
    chips: LIST(p.get("chips")).filter((c): c is IntentFilter => (intents as string[]).includes(c)),
    segmentChips: LIST(p.get("segments")).filter((s): s is UserSegment => (SEGMENT_FILTERS as string[]).includes(s)),
  };
}

function writeFiltersToUrl(f: LiveFilterState) {
  const url = new URL(window.location.href);
  const set = (k: string, v: string, def: string) => (v && v !== def ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set("status", f.status, DEFAULT_FILTERS.status);
  set("window", f.window, DEFAULT_FILTERS.window);
  set("recency", f.recency, DEFAULT_FILTERS.recency);
  set("country", f.country, "");
  set("segment", f.segment, "");
  set("plan", f.plan, "");
  set("intent", f.intent, "");
  set("pql", f.pql, "any");
  set("source", f.source, "");
  set("chips", f.chips.join(","), "");
  set("segments", f.segmentChips.join(","), "");
  window.history.replaceState(null, "", url);
}

const WIDE = "(min-width: 80rem)";

export function LiveDashboard({ data }: { data: LiveIntelligenceData }) {
  const demo = data.source.kind === "demo";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<LiveFilterState>(() => filtersFromParams(new URLSearchParams(searchParams.toString())));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ userId: string; intent: DrawerIntent } | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [searching, startSearch] = useTransition();
  const [sim, setSim] = useState<{ step: number; events: LiveEvent[]; at: string }>({ step: 0, events: [], at: data.generatedAt });
  const [clock, setClock] = useState(() => Date.parse(data.generatedAt));

  // Liveness: poll in live mode, simulate in demo mode.
  useEffect(() => {
    if (demo) {
      const t = setInterval(() => {
        const now = Date.now();
        setClock(now);
        setSim((prev) => {
          const step = prev.step + 1;
          const template = MOCK_EVENT_POOL[(step + 5) % MOCK_EVENT_POOL.length]!;
          return { step, at: new Date(now).toISOString(), events: [{ ...template, id: `sim-${step}`, at: new Date(now).toISOString() }, ...prev.events].slice(0, 6) };
        });
      }, SIMULATE_MS);
      return () => clearInterval(t);
    }
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setClock(Date.now());
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [demo, router]);

  const updateFilters = useCallback((patch: Partial<LiveFilterState>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      writeFiltersToUrl(next);
      return next;
    });
  }, []);
  const resetFilters = useCallback(() => updateFilters(DEFAULT_FILTERS), [updateFilters]);

  const visible = useMemo(
    () => rankLiveUsers(applyLiveFilters(data.users, filters, clock, Date.parse(data.todayStart))),
    [data.users, data.todayStart, filters, clock]
  );
  const onlineInData = useMemo(() => data.users.filter((u) => u.isOnline).length, [data.users]);

  const selected: LiveUser | null =
    visible.find((u) => u.userId === selectedId) ?? data.users.find((u) => u.userId === selectedId) ?? visible[0] ?? null;

  const kpis = demo ? { ...data.kpis, onlineNow: data.kpis.onlineNow + ONLINE_WALK[sim.step % ONLINE_WALK.length]! } : data.kpis;
  const events = demo ? [...sim.events, ...data.events].slice(0, 12) : data.events;

  const selectUser = useCallback((u: LiveUser) => {
    setSelectedId(u.userId);
    if (!window.matchMedia(WIDE).matches) setPanelOpen(true);
  }, []);

  const flash = useCallback((tone: "ok" | "error", text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const createAlert = useCallback(
    async (u: LiveUser) => {
      const result = await createAlertAction(u.userId, `Flagged ${u.name} from Live User Intelligence`, demo);
      if (result.ok) flash("ok", result.data.alertId ? `Alert created for ${u.name}.` : `An alert for ${u.name} was just created.`);
      else flash("error", result.error);
    },
    [demo, flash]
  );

  const onRowAction = useCallback(
    (u: LiveUser, action: RowAction) => {
      setSelectedId(u.userId);
      if (action === "alert") {
        void createAlert(u);
        return;
      }
      const intent: DrawerIntent =
        action === "call" ? "call" : action === "whatsapp" ? "whatsapp" : action === "email" ? "email" : action === "assign" ? "assign" : "profile";
      setDrawer({ userId: u.userId, intent });
    },
    [createAlert]
  );

  const onKpi = (a: KpiAction) => {
    if (a === "online") updateFilters({ status: filters.status === "online" ? "all" : "online" });
    if (a === "pricing") updateFilters({ chips: toggle(filters.chips, "visited_pricing") });
    if (a === "near_limit") updateFilters({ chips: toggle(filters.chips, "apps_45") });
    if (a === "high_intent") updateFilters({ pql: filters.pql === "80" ? "any" : "80" });
  };
  const activeKpi: KpiAction | null =
    filters.status === "online" ? "online" : filters.chips.includes("apps_45") ? "near_limit" : filters.chips.includes("visited_pricing") ? "pricing" : filters.pql === "80" ? "high_intent" : null;

  const preview = (extra?: { onClose?: () => void; className?: string }) => (
    <LiveSessionPreview
      user={selected}
      demo={demo}
      version={data.generatedAt}
      onOpen360={(u) => setDrawer({ userId: u.userId, intent: "profile" })}
      onAssign={(u) => setDrawer({ userId: u.userId, intent: "assign" })}
      onCreateAlert={(u) => void createAlert(u)}
      onClose={extra?.onClose}
      className={extra?.className}
    />
  );

  return (
    <>
      <LiveHeader source={data.source} updatedAt={demo ? sim.at : data.generatedAt} />

      {data.source.kind === "demo" && (
        <p role="note" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {data.source.reason} Activity below is simulated.
        </p>
      )}

      <LiveFilters
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        query={data.query}
        searching={searching}
        onSearchStart={startSearch}
        countryOptions={data.countryOptions}
        sourceOptions={data.sourceOptions}
        planOptions={data.planOptions}
      />

      <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_16.5rem] 2xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <LiveKPIGrid kpis={kpis} onSelect={onKpi} active={activeKpi} />
          <ActiveUsersTable
            users={visible}
            total={data.users.length}
            onlineCount={onlineInData}
            selectedId={selected?.userId ?? null}
            onSelect={selectUser}
            onAction={onRowAction}
            onClearFilters={() => {
              resetFilters();
              if (data.query) router.replace(window.location.pathname, { scroll: false });
            }}
            pending={searching}
          />
        </div>
        <div className="hidden wide:block">
          <div className="sticky top-4 flex max-h-[calc(100vh-2rem)]">{preview({ className: "w-full" })}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 wide:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <ImportantEventsStream
          events={events}
          onSelectUser={(id) => {
            const u = data.users.find((x) => x.userId === id);
            if (u) selectUser(u);
          }}
        />
        <SessionDistribution buckets={data.sessionBuckets} />
        <FeatureUsage rows={data.featureUsage} />
        <IntentSegmentFilters
          intents={filters.chips}
          segments={filters.segmentChips}
          onToggleIntent={(k) => updateFilters({ chips: toggle(filters.chips, k) })}
          onToggleSegment={(s) => updateFilters({ segmentChips: toggle(filters.segmentChips, s) })}
        />
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 wide:hidden" role="dialog" aria-modal="true" aria-label="Live session preview">
          <button type="button" tabIndex={-1} aria-label="Close" onClick={() => setPanelOpen(false)} className="absolute inset-0 animate-fade-in cursor-default bg-gray-900/20" />
          <div className="absolute inset-y-0 right-0 flex w-full animate-drawer-in sm:w-[26rem]">
            {preview({ onClose: () => setPanelOpen(false), className: "w-full rounded-none sm:rounded-l-xl" })}
          </div>
        </div>
      )}

      {drawer && <User360Drawer key={drawer.userId} userId={drawer.userId} intent={drawer.intent} demo={demo} onClose={() => setDrawer(null)} />}

      {toast && (
        <p role="status" className={`fixed right-5 bottom-5 z-[70] animate-fade-in rounded-lg px-3.5 py-2.5 text-xs font-medium shadow-pop ${toast.tone === "ok" ? "bg-gray-900 text-white" : "bg-red-600 text-white"}`}>
          {toast.text}
        </p>
      )}
    </>
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

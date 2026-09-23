import {
  BarChart3,
  Bell,
  CircleHelp,
  Contact,
  Crosshair,
  House,
  Radio,
  RotateCcw,
  Send,
  Settings,
  UserSearch,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "alerts";
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: House },
  { href: "/live-users", label: "Live Users", icon: Radio },
  { href: "/user-intelligence", label: "User Intelligence", icon: UserSearch },
  { href: "/pql-leads", label: "PQL Leads", icon: Crosshair },
  { href: "/auto-apply", label: "Auto Apply", icon: Send },
  { href: "/revenue", label: "Revenue", icon: Wallet },
  { href: "/sales-crm", label: "Sales CRM", icon: Contact },
  { href: "/retention", label: "Retention", icon: RotateCcw },
  { href: "/alerts", label: "Alerts", icon: Bell, badge: "alerts" },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: CircleHelp },
];

/** Sections with their own pages. */
const BUILT_SECTIONS = new Set(["/overview", "/live-users", "/user-intelligence", "/pql-leads", "/sales-crm"]);

/** Sections that exist in the nav but are not built yet. */
export const PLACEHOLDER_SECTIONS = new Map(
  [...PRIMARY_NAV, ...SECONDARY_NAV].filter((n) => !BUILT_SECTIONS.has(n.href)).map((n) => [n.href.slice(1), n.label])
);

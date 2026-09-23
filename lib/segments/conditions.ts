import { ApiError } from "@/lib/http/errors";
import { LIFECYCLE_STAGES } from "@/lib/scoring/lifecycle-config";
import { PRIORITY_TRIGGERS } from "@/lib/scoring/priority";

// ---------------------------------------------------------------------------
// Condition DSL -> parameterized SQL over v_user_facts.
//
// ONE compiler for cohort preview, saved cohorts and automation rule conditions,
// so "preview says 842" and "the saved cohort has 842" can never diverge.
//
//   { "op": "and" | "or", "conditions": [ Condition | Group, ... ] }
//   Condition = { "field": <whitelisted>, "cmp": <operator>, "value"?: ... }
//
// Safety: field names map to a fixed column whitelist (never interpolated from
// input); every value is a bind parameter.
// ---------------------------------------------------------------------------

type FieldType = "string" | "enum" | "number" | "boolean" | "timestamp";

interface FieldDef {
  type: FieldType;
  label: string;
  values?: readonly string[];
}

export const FACT_FIELDS: Record<string, FieldDef> = {
  user_id: { type: "string", label: "User ID" },
  email: { type: "string", label: "Email" },
  name: { type: "string", label: "Name" },
  country: { type: "string", label: "Country" },
  city: { type: "string", label: "City" },
  plan: { type: "string", label: "Plan" },
  acq_source: { type: "string", label: "Acquisition source" },
  acq_medium: { type: "string", label: "Acquisition medium" },
  acq_campaign: { type: "string", label: "Acquisition campaign" },
  how_heard: { type: "string", label: "How they heard" },
  target_role: { type: "string", label: "Target role" },
  experience: { type: "string", label: "Experience" },
  signup_at: { type: "timestamp", label: "Signup time" },
  last_active_at: { type: "timestamp", label: "Last meaningful activity" },
  last_seen_at: { type: "timestamp", label: "Last seen" },
  days_since_active: { type: "number", label: "Days since last activity" },
  days_since_signup: { type: "number", label: "Days since signup" },
  profile_completion: { type: "number", label: "Profile completion %" },
  lifecycle_stage: { type: "enum", label: "Lifecycle stage", values: LIFECYCLE_STAGES },
  pql_score: { type: "number", label: "PQL score" },
  pql_category: { type: "enum", label: "PQL category", values: ["buy_now", "hot", "warm", "engaged", "early"] },
  priority: { type: "enum", label: "Priority", values: ["P0", "P1", "P2"] },
  priority_trigger: { type: "enum", label: "Priority trigger", values: PRIORITY_TRIGGERS },
  is_paid: { type: "boolean", label: "Paid" },
  is_online: { type: "boolean", label: "Online now" },
  auto_apply_used: { type: "number", label: "Free Auto Applies used" },
  auto_apply_success_total: { type: "number", label: "Auto Apply successes (all time)" },
  auto_apply_failed_total: { type: "number", label: "Auto Apply failures (all time)" },
  active_days_7d: { type: "number", label: "Active days, last 7" },
  active_days_30d: { type: "number", label: "Active days, last 30" },
  sessions_7d: { type: "number", label: "Sessions, last 7 days" },
  pricing_views_7d: { type: "number", label: "Pricing views, last 7 days" },
  pricing_views_30d: { type: "number", label: "Pricing views, last 30 days" },
  plan_clicks_30d: { type: "number", label: "Plan clicks, last 30 days" },
  checkout_started_30d: { type: "number", label: "Checkouts started, last 30 days" },
  payments_failed_30d: { type: "number", label: "Failed payments, last 30 days" },
  auto_apply_started_7d: { type: "number", label: "Auto Apply runs, last 7 days" },
  auto_apply_failed_7d: { type: "number", label: "Auto Apply failures, last 7 days" },
  has_open_lead: { type: "boolean", label: "Has open sales lead" },
};

const OPERATORS: Record<FieldType, readonly string[]> = {
  string: ["eq", "neq", "in", "not_in", "contains", "starts_with", "is_null", "is_not_null"],
  enum: ["eq", "neq", "in", "not_in", "is_null", "is_not_null"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null"],
  boolean: ["eq"],
  timestamp: ["before", "after", "within_last_days", "more_than_days_ago", "is_null", "is_not_null"],
};

export const DSL_SCHEMA_VERSION = 1;
const MAX_DEPTH = 5;
const MAX_CONDITIONS = 50;
const MAX_LIST = 500;

export interface Condition {
  field: string;
  cmp: string;
  value?: unknown;
}
export interface ConditionGroup {
  op: "and" | "or";
  conditions: (Condition | ConditionGroup)[];
}

const invalid = (path: string, message: string) =>
  new ApiError("VALIDATION_FAILED", `Invalid condition at ${path || "root"}: ${message}`);

const isGroup = (n: unknown): n is ConditionGroup =>
  typeof n === "object" && n !== null && "op" in n && "conditions" in n;

export interface CompiledConditions {
  sql: string;
  params: unknown[];
}

/**
 * Validate and compile. `params` may already hold values (placeholders continue
 * numbering after them). Throws ApiError(VALIDATION_FAILED) with a path.
 */
export function compileConditions(definition: unknown, params: unknown[] = []): CompiledConditions {
  let count = 0;
  const bind = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const compileNode = (node: unknown, path: string, depth: number): string => {
    if (isGroup(node)) {
      if (depth > MAX_DEPTH) throw invalid(path, `groups nest deeper than ${MAX_DEPTH}`);
      if (node.op !== "and" && node.op !== "or") throw invalid(path, `op must be "and" or "or"`);
      if (!Array.isArray(node.conditions)) throw invalid(path, "conditions must be an array");
      if (node.conditions.length === 0) return node.op === "and" ? "TRUE" : "FALSE";
      const parts = node.conditions.map((c, i) => compileNode(c, `${path}.conditions[${i}]`, depth + 1));
      return `(${parts.join(node.op === "and" ? " AND " : " OR ")})`;
    }

    if (typeof node !== "object" || node === null) throw invalid(path, "expected a condition or group");
    if (++count > MAX_CONDITIONS) throw invalid(path, `more than ${MAX_CONDITIONS} conditions`);

    const { field, cmp, value } = node as Condition;
    const def = typeof field === "string" ? FACT_FIELDS[field] : undefined;
    if (!def) throw invalid(path, `unknown field "${String(field)}"`);
    if (typeof cmp !== "string" || !OPERATORS[def.type].includes(cmp)) {
      throw invalid(path, `operator "${String(cmp)}" not allowed for ${def.type} field ${field}; use one of ${OPERATORS[def.type].join(", ")}`);
    }
    const col = `f."${field}"`;

    const scalar = (v: unknown): unknown => {
      switch (def.type) {
        case "number":
          if (typeof v !== "number" || !Number.isFinite(v)) throw invalid(path, `${field} expects a number`);
          return v;
        case "boolean":
          if (typeof v !== "boolean") throw invalid(path, `${field} expects true or false`);
          return v;
        case "enum":
          if (typeof v !== "string" || !def.values!.includes(v)) {
            throw invalid(path, `${field} must be one of ${def.values!.join(", ")}`);
          }
          return v;
        case "timestamp":
          if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw invalid(path, `${field} expects an ISO-8601 timestamp`);
          return new Date(v).toISOString();
        default:
          if (typeof v !== "string") throw invalid(path, `${field} expects a string`);
          return v;
      }
    };
    const list = (v: unknown): unknown[] => {
      if (!Array.isArray(v) || v.length === 0 || v.length > MAX_LIST) {
        throw invalid(path, `${cmp} expects a non-empty array (max ${MAX_LIST})`);
      }
      return v.map(scalar);
    };
    const positiveInt = (v: unknown) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw invalid(path, `${cmp} expects a non-negative integer`);
      return v;
    };
    const arrayType = def.type === "number" ? "numeric[]" : "text[]";

    switch (cmp) {
      case "is_null":
        return `${col} IS NULL`;
      case "is_not_null":
        return `${col} IS NOT NULL`;
      case "eq":
        return `${col} = ${bind(scalar(value))}`;
      case "neq":
        return `${col} IS DISTINCT FROM ${bind(scalar(value))}`;
      case "gt":
        return `${col} > ${bind(scalar(value))}`;
      case "gte":
        return `${col} >= ${bind(scalar(value))}`;
      case "lt":
        return `${col} < ${bind(scalar(value))}`;
      case "lte":
        return `${col} <= ${bind(scalar(value))}`;
      case "between": {
        if (!Array.isArray(value) || value.length !== 2) throw invalid(path, "between expects [min, max]");
        return `${col} BETWEEN ${bind(scalar(value[0]))} AND ${bind(scalar(value[1]))}`;
      }
      case "in":
        return `${col} = ANY(${bind(list(value))}::${arrayType})`;
      case "not_in":
        return `NOT (${col} = ANY(${bind(list(value))}::${arrayType}))`;
      case "contains":
        return `${col} ILIKE '%' || ${bind(escapeLike(scalar(value) as string))} || '%'`;
      case "starts_with":
        return `${col} ILIKE ${bind(escapeLike(scalar(value) as string))} || '%'`;
      case "before":
        return `${col} < ${bind(scalar(value))}::timestamptz`;
      case "after":
        return `${col} > ${bind(scalar(value))}::timestamptz`;
      case "within_last_days":
        return `${col} >= now() - make_interval(days => ${bind(positiveInt(value))}::int)`;
      case "more_than_days_ago":
        return `${col} < now() - make_interval(days => ${bind(positiveInt(value))}::int)`;
    }
    throw invalid(path, `unsupported operator ${cmp}`);
  };

  if (!isGroup(definition)) throw invalid("", 'root must be a group: { "op": "and"|"or", "conditions": [...] }');
  return { sql: compileNode(definition, "", 1), params };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Field catalogue for API consumers (builder UIs). */
export function describeFields() {
  return Object.entries(FACT_FIELDS).map(([field, d]) => ({
    field,
    label: d.label,
    type: d.type,
    operators: OPERATORS[d.type],
    ...(d.values ? { values: d.values } : {}),
  }));
}

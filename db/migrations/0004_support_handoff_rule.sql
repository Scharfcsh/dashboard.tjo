-- A rule that never matches automatically (empty OR = FALSE). It exists so
-- sales dispositions of "needs_support" can raise a support alert with the same
-- alert shape, SLA and idempotency as rule-generated alerts.
INSERT INTO alert_rules (id, name, description, category, status, is_builtin, conditions, actions, priority, owner_team, sla_minutes, cooldown_hours, created_by, activated_at)
VALUES ('sales_support_handoff', 'Support handoff from sales', 'A caller dispositioned the lead as needing product support.', 'support', 'active', true,
        '{"op":"or","conditions":[]}', '[{"type":"create_alert"}]', 'P1', 'support', 240, 24, 'system', now())
ON CONFLICT (id) DO NOTHING;

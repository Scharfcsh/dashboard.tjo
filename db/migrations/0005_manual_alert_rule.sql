-- Never matches automatically (empty OR = FALSE). Lets dashboard users raise a
-- manual follow-up alert with the same shape, SLA and idempotency as rule alerts.
INSERT INTO alert_rules (id, name, description, category, status, is_builtin, conditions, actions, priority, owner_team, sla_minutes, cooldown_hours, created_by, activated_at)
VALUES ('manual_follow_up', 'Manual follow-up', 'Raised by a team member from Live User Intelligence.', 'sales', 'active', true,
        '{"op":"or","conditions":[]}', '[{"type":"create_alert"}]', 'P1', 'sales', 240, 1, 'system', now())
ON CONFLICT (id) DO NOTHING;

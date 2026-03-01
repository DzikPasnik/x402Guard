-- Phase 4: Spend aggregation RPC for dashboard overview.
-- Returns 24h rolling spend + daily limit for each agent belonging to an owner.

CREATE OR REPLACE FUNCTION get_agent_spend_summary(p_owner_address TEXT)
RETURNS TABLE (
    agent_id        UUID,
    agent_name      TEXT,
    is_active       BOOLEAN,
    spend_24h       BIGINT,
    max_spend_rule  BIGINT,
    pct_used        NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        a.id                          AS agent_id,
        a.name                        AS agent_name,
        a.is_active                   AS is_active,
        COALESCE(SUM(sl.amount), 0)   AS spend_24h,
        gr.daily_limit                AS max_spend_rule,
        CASE
            WHEN gr.daily_limit IS NULL OR gr.daily_limit = 0 THEN NULL
            ELSE ROUND(COALESCE(SUM(sl.amount), 0)::NUMERIC / gr.daily_limit, 4)
        END                           AS pct_used
    FROM agents a
    LEFT JOIN spend_ledger sl
        ON sl.agent_id = a.id
        AND sl.created_at >= NOW() - INTERVAL '24 hours'
    LEFT JOIN LATERAL (
        SELECT (rule_params->>'limit')::BIGINT AS daily_limit
        FROM guardrail_rules
        WHERE agent_id = a.id
          AND rule_type = 'MaxSpendPerDay'
          AND is_active = true
        LIMIT 1
    ) gr ON true
    WHERE a.owner_address = p_owner_address
    GROUP BY a.id, a.name, a.is_active, gr.daily_limit
    ORDER BY a.created_at
$$;

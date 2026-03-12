-- =============================================================================
-- x402Guard — Combined Database Init Script
-- =============================================================================
-- AUTO-GENERATED from proxy/migrations/ (001 through 005).
-- Do NOT edit manually — regenerate from migration files instead.
--
-- Usage: mount as /docker-entrypoint-initdb.d/init.sql in a Postgres container.
-- =============================================================================

-- =============================================================================
-- Migration 001: Create core tables
-- =============================================================================

-- Phase 2: Core tables for agents, guardrail rules, session keys, and spend tracking.

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_agents_owner ON agents(owner_address);

CREATE TABLE guardrail_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    rule_params JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guardrail_rules_agent ON guardrail_rules(agent_id) WHERE is_active;

CREATE TABLE session_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    max_spend BIGINT NOT NULL CHECK (max_spend > 0),
    spent BIGINT NOT NULL DEFAULT 0 CHECK (spent >= 0),
    allowed_contracts JSONB NOT NULL DEFAULT '[]',
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT spent_within_limit CHECK (spent <= max_spend)
);
CREATE INDEX idx_session_keys_agent ON session_keys(agent_id) WHERE NOT is_revoked;
CREATE UNIQUE INDEX idx_session_keys_pubkey ON session_keys(public_key);

CREATE TABLE spend_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_key_id UUID REFERENCES session_keys(id) ON DELETE SET NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    tx_nonce TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spend_ledger_agent_time ON spend_ledger(agent_id, created_at);

-- =============================================================================
-- Migration 002: Create audit log
-- =============================================================================

-- Phase 3 Plan 1: Immutable audit log table.
-- Captures every proxy request, guardrail violation, and session key lifecycle event.
-- Append-only — UPDATE and DELETE are blocked by the immutability trigger.

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    session_key_id UUID REFERENCES session_keys(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- SECURITY: Only valid event types are accepted.
    CONSTRAINT audit_log_event_type_check CHECK (event_type IN (
        'proxy_request_received',
        'proxy_request_forwarded',
        'proxy_request_failed',
        'guardrail_violation',
        'session_key_created',
        'session_key_used',
        'session_key_revoked',
        'all_session_keys_revoked',
        'agent_created',
        'agent_deactivated'
    ))
);

-- Indexes for efficient querying.
CREATE INDEX idx_audit_log_agent_time ON audit_log (agent_id, created_at DESC);
CREATE INDEX idx_audit_log_event_type_time ON audit_log (event_type, created_at DESC);
CREATE INDEX idx_audit_log_session_key ON audit_log (session_key_id, created_at DESC)
    WHERE session_key_id IS NOT NULL;

-- SECURITY: Immutability trigger — prevents UPDATE and DELETE on audit_log.
-- This ensures an append-only audit trail that cannot be tampered with by application code.
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is immutable: % operations are not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_immutable();

-- =============================================================================
-- Migration 003: Add Solana event types
-- =============================================================================

-- Phase 3 Plan 4: Add Solana audit event types to the CHECK constraint.
-- Adds: solana_vault_queried, solana_withdraw_submitted, solana_withdraw_confirmed, solana_withdraw_failed

-- Drop and recreate the CHECK constraint with the expanded event type list.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_event_type_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check CHECK (event_type IN (
    'proxy_request_received',
    'proxy_request_forwarded',
    'proxy_request_failed',
    'guardrail_violation',
    'session_key_created',
    'session_key_used',
    'session_key_revoked',
    'all_session_keys_revoked',
    'agent_created',
    'agent_deactivated',
    'solana_vault_queried',
    'solana_withdraw_submitted',
    'solana_withdraw_confirmed',
    'solana_withdraw_failed'
));

-- =============================================================================
-- Migration 004: Spend aggregation RPC
-- =============================================================================

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

-- =============================================================================
-- Migration 005: Enable RLS
-- =============================================================================

-- SECURITY [CRITICAL-4]: Enable Row Level Security on all tables.
--
-- Defense in depth: The proxy uses the service_role key (bypasses RLS),
-- so these policies protect against direct Supabase access via the anon key.
-- All policies are DENY-ALL for the anon role — data access goes through
-- the proxy API (service_role) exclusively.

-- ── Enable RLS ──────────────────────────────────────────────────────

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrail_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ── Force RLS for table owners too (paranoid mode) ──────────────────
-- By default, table owners bypass RLS. FORCE ensures even the owner
-- goes through policies when using anon/authenticated roles.

ALTER TABLE agents FORCE ROW LEVEL SECURITY;
ALTER TABLE guardrail_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE session_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE spend_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- ── Policies: service_role has full access (used by the proxy) ──────
-- The service_role key is only used server-side (proxy + dashboard SSR).
-- No client-side code should ever have the service_role key.

-- Agents: service_role full access, authenticated read own agents
CREATE POLICY "service_role_agents" ON agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own_agents" ON agents
  FOR SELECT TO authenticated
  USING (owner_address = (auth.jwt() ->> 'wallet_address'));

-- Guardrail rules: service_role full access, authenticated read via agent ownership
CREATE POLICY "service_role_guardrail_rules" ON guardrail_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own_rules" ON guardrail_rules
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE owner_address = (auth.jwt() ->> 'wallet_address')
    )
  );

-- Session keys: service_role full access, authenticated read via agent ownership
CREATE POLICY "service_role_session_keys" ON session_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own_keys" ON session_keys
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE owner_address = (auth.jwt() ->> 'wallet_address')
    )
  );

-- Spend ledger: service_role full access, authenticated read via agent ownership
CREATE POLICY "service_role_spend_ledger" ON spend_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own_spend" ON spend_ledger
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE owner_address = (auth.jwt() ->> 'wallet_address')
    )
  );

-- Audit log: service_role insert only (immutable), authenticated read via agent ownership
CREATE POLICY "service_role_audit_insert" ON audit_log
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service_role_audit_read" ON audit_log
  FOR SELECT TO service_role USING (true);

CREATE POLICY "authenticated_read_own_audit" ON audit_log
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE owner_address = (auth.jwt() ->> 'wallet_address')
    )
  );

-- ── Deny anon role (no anonymous access to any table) ───────────────
-- The anon key should only be used for Supabase Auth operations.
-- No data access policies are created for the anon role (implicit deny).

-- =============================================================================
-- Seed data for testing / local development
-- =============================================================================

DO $$
DECLARE
    v_agent_id UUID;
    v_owner_id UUID := gen_random_uuid();
BEGIN
    -- Insert demo agent
    INSERT INTO agents (id, name, owner_address, is_active)
    VALUES (gen_random_uuid(), 'demo-agent', '0x713B654eC60352AA88a23e9A5e436A733Ee72BEb', true)
    RETURNING id INTO v_agent_id;

    -- Guardrail: max 1.0 USDC per transaction (1_000_000 = 1 USDC with 6 decimals)
    INSERT INTO guardrail_rules (agent_id, rule_type, rule_params, is_active)
    VALUES (v_agent_id, 'MaxSpendPerTx', '{"limit": 1000000}'::jsonb, true);

    -- Guardrail: max 10.0 USDC per day (10_000_000 = 10 USDC with 6 decimals)
    INSERT INTO guardrail_rules (agent_id, rule_type, rule_params, is_active)
    VALUES (v_agent_id, 'MaxSpendPerDay', '{"limit": 10000000}'::jsonb, true);

    RAISE NOTICE 'Seed data inserted: agent_id=%, owner_id=%', v_agent_id, v_owner_id;
END $$;

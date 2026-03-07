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

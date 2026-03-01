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

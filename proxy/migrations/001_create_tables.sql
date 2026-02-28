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

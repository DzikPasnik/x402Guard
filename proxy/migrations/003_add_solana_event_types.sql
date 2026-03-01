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

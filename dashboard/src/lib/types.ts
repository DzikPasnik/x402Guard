// Types matching the Rust proxy API response shapes

export interface Agent {
  id: string
  name: string
  owner_address: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RuleType =
  | 'MaxSpendPerTx'
  | 'MaxSpendPerDay'
  | 'AllowedContracts'
  | 'MaxLeverage'
  | 'MaxSlippage'

export interface GuardrailRule {
  id: string
  agent_id: string
  rule_type: RuleType
  rule_params: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SessionKey {
  id: string
  agent_id: string
  public_key: string
  max_spend: number
  spent: number
  allowed_contracts: string[]
  expires_at: string
  is_revoked: boolean
  created_at: string
  updated_at: string
}

export type AuditEventType =
  | 'proxy_request_received'
  | 'proxy_request_forwarded'
  | 'proxy_request_failed'
  | 'guardrail_violation'
  | 'session_key_created'
  | 'session_key_used'
  | 'session_key_revoked'
  | 'all_session_keys_revoked'
  | 'agent_created'
  | 'agent_deactivated'
  | 'solana_vault_queried'
  | 'solana_withdraw_submitted'
  | 'solana_withdraw_confirmed'
  | 'solana_withdraw_failed'

export interface AuditLogEntry {
  id: string
  agent_id: string | null
  session_key_id: string | null
  event_type: AuditEventType
  metadata: Record<string, unknown>
  created_at: string
}

export interface AgentSpendSummary {
  agent_id: string
  agent_name: string
  is_active: boolean
  spend_24h: number
  max_spend_rule: number | null
  pct_used: number | null
}

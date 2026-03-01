import { supabase } from './supabase'
import type { AuditEventType } from './types'

export { type AuditEventType } from './types'

export const ALL_EVENT_TYPES: readonly AuditEventType[] = [
  'proxy_request_received', 'proxy_request_forwarded', 'proxy_request_failed',
  'guardrail_violation', 'session_key_created', 'session_key_used',
  'session_key_revoked', 'all_session_keys_revoked', 'agent_created',
  'agent_deactivated', 'solana_vault_queried', 'solana_withdraw_submitted',
  'solana_withdraw_confirmed', 'solana_withdraw_failed',
] as const

export interface AuditLogFilters {
  agentId?: string
  eventTypes?: AuditEventType[]
  fromDate?: string
  toDate?: string
  cursorId?: string
  pageSize?: number
}

export interface AuditRow {
  id: string
  agent_id: string | null
  session_key_id: string | null
  event_type: AuditEventType
  metadata: Record<string, unknown>
  created_at: string
}

export interface AuditPage {
  rows: AuditRow[]
  hasNextPage: boolean
}

export async function fetchAuditLog(filters: AuditLogFilters = {}): Promise<AuditPage> {
  const pageSize = filters.pageSize ?? 25

  let query = supabase
    .from('audit_log')
    .select('id, agent_id, session_key_id, event_type, metadata, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize + 1)

  if (filters.agentId) {
    query = query.eq('agent_id', filters.agentId)
  }

  if (filters.eventTypes && filters.eventTypes.length > 0) {
    query = query.in('event_type', filters.eventTypes)
  }

  if (filters.fromDate) {
    query = query.gte('created_at', filters.fromDate)
  }

  if (filters.toDate) {
    query = query.lte('created_at', filters.toDate)
  }

  // Cursor-based pagination
  if (filters.cursorId) {
    const { data: cursorRow } = await supabase
      .from('audit_log')
      .select('created_at')
      .eq('id', filters.cursorId)
      .single()

    if (cursorRow) {
      query = query.or(
        `created_at.lt.${cursorRow.created_at},and(created_at.eq.${cursorRow.created_at},id.lt.${filters.cursorId})`
      )
    }
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Audit log query failed: ${error.message}`)
  }

  const rows = (data ?? []) as AuditRow[]
  const hasNextPage = rows.length > pageSize

  if (hasNextPage) {
    rows.pop()
  }

  return { rows, hasNextPage }
}

export interface AgentOption {
  id: string
  name: string
  is_active: boolean
}

export async function fetchAgents(): Promise<AgentOption[]> {
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, is_active')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Agent list query failed: ${error.message}`)
  }

  return (data ?? []) as AgentOption[]
}

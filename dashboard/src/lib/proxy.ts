import { cache } from 'react'
import type { Agent, GuardrailRule, SessionKey, AuditLogEntry, AgentSpendSummary } from '@/lib/types'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const PROXY_BASE = process.env.PROXY_URL ?? 'http://localhost:3402'

interface ApiResponse<T> {
  success: boolean
  data: T | null
  error?: string
}

interface ApiListResponse<T> {
  success: boolean
  data: T[]
}

async function proxyFetch<T>(path: string): Promise<T> {
  const url = `${PROXY_BASE}${path}`
  const res = await fetch(url, {
    cache: 'no-store', // always fresh — dashboard is a dynamic app
  })
  if (!res.ok) {
    throw new Error(`Proxy API error: ${res.status} ${res.statusText} for ${path}`)
  }
  const body = await res.json()
  return body as T
}

// ─── Single-agent fetch ────────────────────────────────────────────

export const getAgent = cache(async (agentId: string): Promise<Agent> => {
  const body = await proxyFetch<ApiResponse<Agent>>(`/api/v1/agents/${agentId}`)
  if (!body.success || !body.data) {
    throw new Error(body.error ?? `Agent ${agentId} not found`)
  }
  return body.data
})

// ─── Rules ─────────────────────────────────────────────────────────

export const getAgentRules = cache(async (agentId: string): Promise<GuardrailRule[]> => {
  const body = await proxyFetch<ApiListResponse<GuardrailRule>>(
    `/api/v1/agents/${agentId}/rules`
  )
  return body.data
})

// ─── Session Keys ──────────────────────────────────────────────────

export const getAgentSessionKeys = cache(async (agentId: string): Promise<SessionKey[]> => {
  const body = await proxyFetch<ApiListResponse<SessionKey>>(
    `/api/v1/agents/${agentId}/session-keys`
  )
  return body.data
})

// ─── Audit Logs ────────────────────────────────────────────────────

export const getAgentAuditLogs = cache(async (agentId: string): Promise<AuditLogEntry[]> => {
  const body = await proxyFetch<ApiListResponse<AuditLogEntry>>(
    `/api/v1/agents/${agentId}/audit-logs`
  )
  return body.data
})

// ─── Spend Summary ─────────────────────────────────────────────────

export const getSpendSummaries = cache(async (): Promise<AgentSpendSummary[]> => {
  const body = await proxyFetch<ApiListResponse<AgentSpendSummary>>(
    `/api/v1/spend-summary`
  )
  return body.data
})

// ─── List agents by owner (Supabase direct query) ──────────────────
// The proxy has no "list all agents" endpoint.
// We query the Supabase agents table directly, filtered by owner address.

export async function getAgentsByOwner(ownerAddress: string): Promise<Agent[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, owner_address, is_active, created_at')
    .ilike('owner_address', ownerAddress)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch agents: ${error.message}`)
  }

  return data ?? []
}

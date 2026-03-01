import { supabase } from './supabase'
import type { AgentSpendSummary } from './types'

export type { AgentSpendSummary } from './types'

export async function fetchAgentSpendSummary(
  ownerAddress: string
): Promise<AgentSpendSummary[]> {
  const { data, error } = await supabase.rpc('get_agent_spend_summary', {
    p_owner_address: ownerAddress,
  })

  if (error) {
    throw new Error(`Spend summary query failed: ${error.message}`)
  }

  return (data ?? []) as AgentSpendSummary[]
}

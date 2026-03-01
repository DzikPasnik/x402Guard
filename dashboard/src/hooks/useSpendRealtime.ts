'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface SpendLedgerInsert {
  id: string
  agent_id: string
  session_key_id: string | null
  amount: number
  tx_nonce: string
  created_at: string
}

/**
 * Subscribe to Realtime INSERT events on spend_ledger for a specific agent.
 * Uses callbackRef pattern to prevent re-subscription on every render.
 */
export function useSpendRealtime(
  agentId: string | null,
  onInsert: (row: SpendLedgerInsert) => void
): void {
  const callbackRef = useRef(onInsert)
  callbackRef.current = onInsert

  const stableOnInsert = useCallback(
    (row: SpendLedgerInsert) => callbackRef.current(row),
    []
  )

  useEffect(() => {
    if (!agentId) return

    const channel = supabase
      .channel(`spend_ledger:${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'spend_ledger',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          const row = payload.new as SpendLedgerInsert
          // Client-side filter fallback
          if (row.agent_id === agentId) {
            stableOnInsert(row)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId, stableOnInsert])
}

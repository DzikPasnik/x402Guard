'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSpendRealtime, type SpendLedgerInsert } from '@/hooks/useSpendRealtime'
import { SpendProgressBar } from './SpendProgressBar'
import { SpendAlertBadge } from './SpendAlertBadge'
import { formatUsdc } from '@/lib/utils'

interface SpendMonitorProps {
  readonly agentId: string
  readonly agentName: string
  readonly initialSpent: number
  readonly dailyCap: number | null
}

export function SpendMonitor({ agentId, agentName, initialSpent, dailyCap }: SpendMonitorProps) {
  const [spent, setSpent] = useState(initialSpent)
  const prevPctRef = useRef<number | null>(null)

  const pctUsed = dailyCap !== null && dailyCap > 0 ? spent / dailyCap : null

  // Track 80% threshold crossing for toast alerts
  useEffect(() => {
    if (pctUsed !== null && prevPctRef.current !== null) {
      if (prevPctRef.current < 0.8 && pctUsed >= 0.8) {
        toast.warning(
          `${agentName} approaching limit: ${Math.round(pctUsed * 100)}% of daily budget used`
        )
      }
    }
    prevPctRef.current = pctUsed
  }, [pctUsed, agentName])

  useSpendRealtime(agentId, (row: SpendLedgerInsert) => {
    setSpent((prev) => prev + row.amount)
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">24h Spend</span>
        <span className="font-mono font-medium">{formatUsdc(spent)} USDC</span>
      </div>
      {dailyCap !== null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Daily Limit</span>
          <span className="font-mono font-medium">{formatUsdc(dailyCap)} USDC</span>
        </div>
      )}
      <SpendProgressBar pctUsed={pctUsed} />
      <div className="flex justify-end">
        <SpendAlertBadge pctUsed={pctUsed} />
      </div>
    </div>
  )
}

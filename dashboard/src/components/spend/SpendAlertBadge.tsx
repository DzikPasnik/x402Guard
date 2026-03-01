'use client'

import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SpendAlertBadgeProps {
  readonly pctUsed: number | null
}

export function SpendAlertBadge({ pctUsed }: SpendAlertBadgeProps) {
  if (pctUsed === null) return null

  const pct = Math.round(pctUsed * 100)

  if (pctUsed >= 0.8) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        {pct}% used
      </Badge>
    )
  }

  if (pctUsed >= 0.5) {
    return (
      <Badge variant="secondary" className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
        {pct}% used
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="text-green-700 dark:text-green-400">
      {pct}% used
    </Badge>
  )
}

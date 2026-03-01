'use client'

import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface SpendProgressBarProps {
  readonly pctUsed: number | null
  readonly className?: string
}

function getAlertColor(pct: number): string {
  if (pct >= 0.8) return '[&>div]:bg-destructive'
  if (pct >= 0.5) return '[&>div]:bg-yellow-500'
  return '[&>div]:bg-green-500'
}

export function SpendProgressBar({ pctUsed, className }: SpendProgressBarProps) {
  if (pctUsed === null) {
    return <span className="text-sm text-muted-foreground">No limit set</span>
  }

  const displayPct = Math.min(pctUsed * 100, 100)

  return (
    <Progress
      value={displayPct}
      className={cn('h-2', getAlertColor(pctUsed), className)}
    />
  )
}

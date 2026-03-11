"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DashboardErrorProps {
  readonly error: Error & { digest?: string }
  readonly reset: () => void
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("[x402Guard] Dashboard error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24">
      <div className="rounded-full border border-destructive/20 bg-destructive/5 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive/60" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">Dashboard Error</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Something went wrong loading this section. Your agents and
          guardrails are unaffected &mdash; the proxy continues enforcing
          rules independently.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono">
            ID: {error.digest}
          </p>
        )}
      </div>

      <Button variant="outline" onClick={reset} className="gap-2">
        <RotateCcw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  )
}

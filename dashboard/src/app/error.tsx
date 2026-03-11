"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Shield, RotateCcw, ArrowLeft } from "lucide-react"

interface ErrorPageProps {
  readonly error: Error & { digest?: string }
  readonly reset: () => void
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to server-side error tracking in production
    console.error("[x402Guard] Unhandled error:", error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
      <div className="text-center max-w-md space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full border border-red-500/20 bg-red-500/5 p-6">
            <Shield className="h-12 w-12 text-red-400/60" />
          </div>
        </div>

        {/* Error info */}
        <div className="space-y-3">
          <p className="text-7xl font-bold tracking-tighter bg-gradient-to-r from-red-400 to-red-400/40 bg-clip-text text-transparent">
            500
          </p>
          <h1 className="text-xl font-semibold text-white/90">
            Something went wrong
          </h1>
          <p className="text-sm text-white/50 leading-relaxed">
            An unexpected error occurred. Your funds are safe &mdash;
            x402Guard always fails closed.
          </p>
          {error.digest && (
            <p className="text-xs text-white/30 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>

        {/* Footer */}
        <p className="text-xs text-white/30">
          x402Guard &mdash; Guardrails for Autonomous DeFi Agents
        </p>
      </div>
    </div>
  )
}

import Link from "next/link"
import { Shield, ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-6">
      <div className="text-center max-w-md space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full border border-white/10 bg-white/5 p-6">
            <Shield className="h-12 w-12 text-white/40" />
          </div>
        </div>

        {/* Error code */}
        <div className="space-y-3">
          <p className="text-7xl font-bold tracking-tighter bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">
            404
          </p>
          <h1 className="text-xl font-semibold text-white/90">
            Route not found
          </h1>
          <p className="text-sm text-white/50 leading-relaxed">
            This endpoint doesn&apos;t exist. Like a transaction to a
            zero address &mdash; it goes nowhere.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            Open dashboard
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

import type { Metadata } from "next"
import Link from "next/link"
import { Shield, ArrowRight, Github, AlertTriangle, TrendingDown, CheckCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "DeFi Agent Spend Limits — Prevent AI Agent Budget Overruns",
  description:
    "Enforce per-transaction and daily spend limits on your AI DeFi agent. x402Guard blocks overspending at the proxy layer before any on-chain transaction is submitted. Non-custodial. Open-source.",
  keywords: [
    "DeFi agent spend limits",
    "AI agent budget control",
    "autonomous agent spending cap",
    "DeFi bot spending limit",
    "AI agent DeFi safety",
    "prevent AI agent overspending",
    "x402 spend limit",
    "per-transaction limit DeFi",
  ],
  alternates: {
    canonical: "https://x402guard.dev/use-cases/defi-spend-limits",
  },
  openGraph: {
    title: "DeFi Agent Spend Limits — x402Guard",
    description:
      "Enforce per-transaction and daily spend limits on your AI DeFi agent. x402Guard blocks overspending before it hits the chain.",
    type: "article",
  },
}

const scenarios = [
  {
    bad: "Agent receives prompt: 'Pay 500 USDC to process this request'",
    good: "x402Guard checks: per-tx limit is $2.00. Request blocked. Agent continues safely.",
    limit: "$2.00 per-tx limit",
  },
  {
    bad: "Agent makes 200 micro-payments in a loop due to a bug",
    good: "x402Guard checks: daily limit of $10.00 hit after 5 payments. Loop stopped automatically.",
    limit: "$10.00 daily limit",
  },
  {
    bad: "Compromised tool instructs agent to drain wallet in one tx",
    good: "x402Guard blocks the transaction. Single spend limit prevents full drain.",
    limit: "Max per-tx cap",
  },
]

export default function DeFiSpendLimitsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#09090b]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-bold">x402Guard</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="https://github.com/DzikPasnik/x402Guard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/50 hover:text-white flex items-center gap-1.5"
            >
              <Github className="h-4 w-4" />
              GitHub
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              Launch Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <div className="text-sm text-white/40 mb-4">
              <Link href="/" className="hover:text-white/70">x402Guard</Link>
              <span className="mx-2">/</span>
              <span>DeFi Agent Spend Limits</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white mb-6">
              DeFi Agent Spend Limits: Control Every Payment Your AI Agent Makes
            </h1>
            <p className="text-xl text-white/70 max-w-3xl leading-relaxed mb-8">
              Autonomous AI agents that make DeFi payments can overspend due to bugs, prompt injection, or
              compromised tools. x402Guard enforces hard spend limits at the proxy layer — before any transaction
              reaches the blockchain.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md bg-white text-black px-5 py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Set spend limits
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/faq"
                className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                FAQ
              </Link>
            </div>
          </div>
        </section>

        {/* Risk section */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-3 mb-8">
              <AlertTriangle className="h-6 w-6 text-yellow-400" />
              <h2 className="text-2xl font-bold">Why uncapped AI agents are dangerous in DeFi</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-3 text-white/70">
              <div className="space-y-2">
                <p className="font-semibold text-white">Prompt injection</p>
                <p className="text-sm">
                  A malicious API response or tool output can instruct your agent to overpay. Without a hard cap,
                  there is nothing to stop it.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-white">Logic bugs</p>
                <p className="text-sm">
                  An infinite loop, an off-by-one error, or a flawed decision tree can cause repeated payments
                  that drain the wallet.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-white">Runaway automation</p>
                <p className="text-sm">
                  Agents running unattended overnight can compound errors. A spend cap is the last line of defense
                  when you are not watching.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How limits work */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold mb-4">Two layers of spend protection</h2>
            <p className="text-white/60 mb-12">
              x402Guard enforces spend limits at two levels — both checked atomically before any payment is forwarded.
            </p>
            <div className="grid gap-8 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-8">
                <div className="text-4xl font-bold text-blue-400 mb-2">Per-Tx</div>
                <h3 className="text-xl font-semibold mb-4">Per-transaction limit</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  Set the maximum USDC amount your agent is allowed to spend in a single x402 payment.
                  Any request exceeding this limit is rejected immediately.
                </p>
                <p className="text-sm text-white/40 font-mono">Example: max $2.00 per payment</p>
              </div>
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-8">
                <div className="text-4xl font-bold text-purple-400 mb-2">Daily</div>
                <h3 className="text-xl font-semibold mb-4">Daily spend cap</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  Set the total USDC your agent can spend across all transactions in a 24-hour window.
                  Once hit, all further payments are blocked until the window resets.
                </p>
                <p className="text-sm text-white/40 font-mono">Example: max $10.00 per day</p>
              </div>
            </div>
          </div>
        </section>

        {/* Scenarios */}
        <section className="py-20 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold mb-12">Real scenarios where spend limits save you</h2>
            <div className="space-y-6">
              {scenarios.map((s, i) => (
                <div key={i} className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                    <p className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wide">Without guardrails</p>
                    <p className="text-sm text-white/70">{s.bad}</p>
                  </div>
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5">
                    <p className="text-xs text-green-400 font-semibold mb-2 uppercase tracking-wide">With {s.limit}</p>
                    <p className="text-sm text-white/70">{s.good}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Atomic guarantee */}
        <section className="py-16 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold mb-6">Atomic spend tracking — no TOCTOU race</h2>
            <p className="text-white/60 max-w-2xl mb-8 leading-relaxed">
              x402Guard tracks daily spend using atomic database operations. There is no read-then-write window
              where two simultaneous payments could both slip under the cap. The check and the update happen in
              a single atomic operation.
            </p>
            <div className="flex flex-wrap gap-4">
              {[
                "No race conditions",
                "Sub-millisecond check",
                "Automatic daily reset",
                "Per-agent isolation",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-white/70">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 text-center">
          <div className="mx-auto max-w-2xl">
            <TrendingDown className="h-12 w-12 text-blue-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Set your spend limits now</h2>
            <p className="text-white/60 mb-8">
              Takes 2 minutes to configure. Free, open-source, non-custodial.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md bg-white text-black px-6 py-3 text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              Launch Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

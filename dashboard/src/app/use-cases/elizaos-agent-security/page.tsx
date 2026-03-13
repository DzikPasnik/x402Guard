import type { Metadata } from "next"
import Link from "next/link"
import { Shield, ArrowRight, CheckCircle, Github, Lock, Eye, FileCheck, Timer } from "lucide-react"

export const metadata: Metadata = {
  title: "ElizaOS Agent Security — Spend Limits & Guardrails",
  description:
    "Secure your ElizaOS AI agent with non-custodial guardrails. Enforce per-transaction spend limits, contract whitelists, and auto-expiring session keys on every x402 payment. Open-source plugin for ElizaOS on Base.",
  keywords: [
    "ElizaOS security",
    "ElizaOS agent guardrails",
    "ElizaOS spend limits",
    "ElizaOS DeFi plugin",
    "AI agent security ElizaOS",
    "ElizaOS x402 plugin",
    "autonomous agent safety ElizaOS",
  ],
  alternates: {
    canonical: "https://x402guard.dev/use-cases/elizaos-agent-security",
  },
  openGraph: {
    title: "ElizaOS Agent Security — x402Guard",
    description:
      "Non-custodial guardrails for ElizaOS agents. Spend limits, contract whitelists, and session keys on every payment.",
    type: "article",
  },
}

const benefits = [
  {
    icon: Shield,
    title: "Per-transaction spend limits",
    description:
      "Cap how much USDC your ElizaOS agent can spend in a single x402 transaction. If the agent tries to pay more, x402Guard blocks it at the proxy layer — no on-chain transaction is ever submitted.",
  },
  {
    icon: FileCheck,
    title: "Contract address whitelist",
    description:
      "Explicitly approve which smart contract addresses your ElizaOS agent is allowed to interact with. Any payment attempt to an unapproved address is rejected before it reaches the network.",
  },
  {
    icon: Timer,
    title: "Auto-expiring session keys",
    description:
      "EIP-7702 session keys give your ElizaOS agent limited signing authority that expires automatically. When the session ends, the key is revoked — your main wallet is never exposed.",
  },
  {
    icon: Eye,
    title: "Immutable audit log",
    description:
      "Every payment attempt — approved or blocked — is logged in an append-only audit trail. See exactly what your ElizaOS agent tried to spend, when, and why it was allowed or rejected.",
  },
]

const steps = [
  {
    step: "1",
    title: "Install the x402Guard ElizaOS plugin",
    code: 'npm install @x402guard/elizaos-plugin',
  },
  {
    step: "2",
    title: "Configure your guardrail rules",
    code: `// elizaos.config.ts
x402Guard: {
  proxyUrl: "https://your-guard.x402guard.dev",
  spendLimitPerTx: "1.00",   // USDC
  dailySpendLimit: "10.00",  // USDC
  allowedContracts: ["0x..."],
}`,
  },
  {
    step: "3",
    title: "Your agent runs, guardrails enforce",
    code: `// Every x402 payment goes through x402Guard
// Exceeds limit? Blocked. Unknown contract? Blocked.
// Clean payment? Forwarded. All logged.`,
  },
]

export default function ElizaOSAgentSecurityPage() {
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
              <span>ElizaOS Agent Security</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white mb-6">
              ElizaOS Agent Security with Non-Custodial Guardrails
            </h1>
            <p className="text-xl text-white/70 max-w-3xl leading-relaxed mb-8">
              ElizaOS agents that handle real DeFi payments need more than just a wallet. x402Guard adds a
              non-custodial safety layer between your ElizaOS agent and the blockchain — enforcing spend limits,
              contract whitelists, and session keys without ever taking custody of your funds.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md bg-white text-black px-5 py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Set up guardrails
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="https://github.com/DzikPasnik/x402Guard/tree/main/examples/elizaos"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                <Github className="h-4 w-4" />
                View ElizaOS example
              </Link>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold mb-6">The problem with unguarded ElizaOS agents</h2>
            <div className="grid gap-4 sm:grid-cols-3 text-white/70">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                <p className="font-semibold text-red-400 mb-2">No spend cap</p>
                <p className="text-sm">
                  A buggy prompt or compromised tool can instruct your agent to drain its entire wallet in one transaction.
                </p>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                <p className="font-semibold text-red-400 mb-2">No contract control</p>
                <p className="text-sm">
                  Nothing stops your agent from paying a malicious contract address injected via prompt manipulation.
                </p>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                <p className="font-semibold text-red-400 mb-2">No audit trail</p>
                <p className="text-sm">
                  When something goes wrong, you have no log of what the agent tried to do or why funds moved.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold mb-12">What x402Guard adds to your ElizaOS agent</h2>
            <div className="grid gap-8 sm:grid-cols-2">
              {benefits.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <div key={benefit.title} className="flex gap-4">
                    <div className="shrink-0">
                      <Icon className="h-6 w-6 text-blue-400 mt-0.5" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">{benefit.title}</h3>
                      <p className="text-sm text-white/60 leading-relaxed">{benefit.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold mb-12">How to add guardrails to your ElizaOS agent</h2>
            <div className="space-y-8">
              {steps.map((item) => (
                <div key={item.step} className="flex gap-6">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-sm font-bold text-blue-400">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-3">{item.title}</h3>
                    <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm text-white/70 overflow-x-auto">
                      <code>{item.code}</code>
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key facts */}
        <section className="py-16 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold mb-8">Non-custodial by design</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Lock, text: "x402Guard never holds your private keys" },
                { icon: Shield, text: "Guardrails run server-side, funds stay on-chain" },
                { icon: CheckCircle, text: "Open-source — audit the code yourself" },
                { icon: Eye, text: "Every decision is logged and queryable" },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.text} className="flex items-start gap-3 rounded-lg border border-white/10 p-4">
                    <Icon className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-white/70">{item.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold mb-4">Protect your ElizaOS agent today</h2>
            <p className="text-white/60 mb-8">
              Set up guardrail rules in minutes. Free and open-source under MIT License.
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

import type { Metadata } from "next"
import Link from "next/link"
import { Shield, ArrowRight, Github, FileCheck, Lock, XCircle, CheckCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "DeFi Contract Whitelist for AI Agents — Block Rogue Payments",
  description:
    "Whitelist approved smart contract addresses for your AI DeFi agent. x402Guard blocks any payment attempt to unapproved contracts before it reaches the blockchain. Non-custodial. Open-source.",
  keywords: [
    "DeFi contract whitelist",
    "AI agent contract whitelist",
    "smart contract whitelist DeFi",
    "block rogue AI agent payments",
    "AI agent DeFi firewall",
    "autonomous agent contract control",
    "prevent AI agent drain",
    "DeFi address whitelist",
  ],
  alternates: {
    canonical: "https://x402guard.dev/use-cases/contract-whitelist",
  },
  openGraph: {
    title: "DeFi Contract Whitelist for AI Agents — x402Guard",
    description:
      "Whitelist approved contract addresses. x402Guard blocks any payment to unapproved contracts before it reaches the blockchain.",
    type: "article",
  },
}

const attacks = [
  {
    name: "Prompt injection",
    description:
      "A malicious API response or injected tool output tells your agent to pay a new, unknown contract address. Without a whitelist, the agent complies.",
  },
  {
    name: "Address substitution",
    description:
      "The agent's internal state is manipulated (via a bug or attack) to replace a known contract address with an attacker-controlled one.",
  },
  {
    name: "Phishing via tools",
    description:
      "A compromised tool used by your agent returns a fake contract address that looks legitimate but routes funds to an attacker.",
  },
]

export default function ContractWhitelistPage() {
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
              <span>Contract Whitelist</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white mb-6">
              Contract Whitelist: Only Approved Addresses Can Receive Your Agent&apos;s Funds
            </h1>
            <p className="text-xl text-white/70 max-w-3xl leading-relaxed mb-8">
              An autonomous AI agent that can pay any contract address is a security liability. x402Guard&apos;s
              contract whitelist ensures your agent can only send funds to explicitly approved addresses —
              any other payment attempt is blocked before it hits the blockchain.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md bg-white text-black px-5 py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Configure whitelist
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

        {/* Attack vectors */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold mb-8">How AI agents get tricked into paying wrong addresses</h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {attacks.map((attack) => (
                <div key={attack.name} className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                    <p className="font-semibold text-red-400">{attack.name}</p>
                  </div>
                  <p className="text-sm text-white/60">{attack.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How whitelist works */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold mb-12">How the contract whitelist works</h2>
            <div className="grid gap-8 sm:grid-cols-2 items-start">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-sm font-bold text-green-400">1</div>
                  <div>
                    <h3 className="font-semibold mb-1">You define approved addresses</h3>
                    <p className="text-sm text-white/60">In the x402Guard dashboard, you create a list of contract addresses your agent is permitted to pay. These are the only valid payment destinations.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-sm font-bold text-green-400">2</div>
                  <div>
                    <h3 className="font-semibold mb-1">Agent initiates a payment</h3>
                    <p className="text-sm text-white/60">When your agent calls the x402 endpoint, x402Guard intercepts the request before it reaches any blockchain node.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-sm font-bold text-green-400">3</div>
                  <div>
                    <h3 className="font-semibold mb-1">Address is checked against whitelist</h3>
                    <p className="text-sm text-white/60">x402Guard checks both the contract address AND the token authority. Both must be on the approved list for the payment to proceed.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-sm font-bold text-blue-400">4</div>
                  <div>
                    <h3 className="font-semibold mb-1">Approved or blocked, always logged</h3>
                    <p className="text-sm text-white/60">Whether the payment is forwarded or rejected, the decision is written to the immutable audit log with timestamp and reason.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 font-mono text-sm space-y-3">
                <p className="text-white/40 text-xs mb-4">// x402Guard rule config</p>
                <div className="space-y-1">
                  <p className="text-purple-400">allowed_contracts: [</p>
                  <p className="text-green-400 pl-4">&quot;0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&quot;, <span className="text-white/40">// USDC</span></p>
                  <p className="text-green-400 pl-4">&quot;0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&quot;, <span className="text-white/40">// USDC Base</span></p>
                  <p className="text-purple-400">]</p>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-white/60">Payment to 0xA0b8... → <span className="text-green-400">APPROVED</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-white/60">Payment to 0xDEAD... → <span className="text-red-400">BLOCKED</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dual check */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold mb-6">Dual authority + address check</h2>
            <p className="text-white/60 max-w-2xl mb-8 leading-relaxed">
              x402Guard validates both the payment facilitator authority and the destination contract address.
              An attacker cannot bypass the whitelist by changing one while leaving the other intact.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border border-white/10 p-4">
                <FileCheck className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-1">Authority check</p>
                  <p className="text-xs text-white/50">Verifies the payment facilitator authority matches your approved list</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-white/10 p-4">
                <Lock className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-1">Address check</p>
                  <p className="text-xs text-white/50">Verifies the destination contract address is on the approved list</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold mb-4">Whitelist your contracts today</h2>
            <p className="text-white/60 mb-8">
              Free, open-source, non-custodial. Your funds, your rules.
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

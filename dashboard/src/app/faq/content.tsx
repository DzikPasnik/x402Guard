"use client"

import Link from "next/link"
import { Shield, ArrowRight, Github } from "lucide-react"
import GradientText from "@/components/GradientText"
import ScrollFloat from "@/components/ScrollFloat"
import SpotlightCard from "@/components/SpotlightCard"
import StarBorder from "@/components/StarBorder"

const faqs = [
  {
    section: "About x402Guard",
    items: [
      {
        q: "What is x402Guard?",
        a: "x402Guard is a non-custodial safety proxy for autonomous AI agents that make DeFi payments using the x402 protocol. It enforces spend limits, contract whitelists, and session keys on every payment — without ever taking custody of your funds.",
      },
      {
        q: "What is the x402 protocol?",
        a: 'x402 is an HTTP payment protocol that allows AI agents to make machine-to-machine micropayments using stablecoins (primarily USDC). When an agent requests a paid API, the server responds with HTTP 402 "Payment Required" and the agent fulfills the payment automatically.',
      },
      {
        q: "Is x402Guard open-source?",
        a: "Yes. x402Guard is fully open-source under the MIT License. The Rust proxy, Next.js dashboard, Solana program, and all framework plugins are on GitHub at DzikPasnik/x402Guard. You can audit, fork, and self-host it.",
      },
    ],
  },
  {
    section: "Security model",
    items: [
      {
        q: "Is x402Guard custodial? Does it hold my funds?",
        a: "No. x402Guard is fully non-custodial. It never holds your private keys or funds. It acts as a proxy that intercepts payment requests and enforces your rules before forwarding approved payments. Your wallet and keys remain entirely under your control.",
      },
      {
        q: "How does the non-custodial model work technically?",
        a: "Your AI agent signs payment authorizations using its own private key. x402Guard validates the authorization, checks it against your guardrail rules (spend limit, whitelist, session key validity), and either forwards or rejects it. At no point does x402Guard sign anything or hold funds.",
      },
      {
        q: "Can x402Guard be bypassed by a compromised agent?",
        a: "x402Guard is a mandatory proxy layer — your agent routes payments through it. The session key design limits what an agent can sign even if compromised, and the whitelist prevents payments to unknown addresses regardless of how the agent is instructed.",
      },
    ],
  },
  {
    section: "Guardrail features",
    items: [
      {
        q: "How do spend limits work?",
        a: "Two layers: a per-transaction cap (max USDC per single payment) and a daily cap (max total USDC per 24-hour window). Both are checked atomically before any payment is forwarded, preventing race conditions where two simultaneous payments could both slip under the cap.",
      },
      {
        q: "What is a contract whitelist?",
        a: "A list of approved smart contract addresses your agent is allowed to pay. Any payment to an unlisted address is blocked before it reaches the blockchain. x402Guard validates both the payment authority and the destination address.",
      },
      {
        q: "What are EIP-7702 session keys?",
        a: "Temporary, limited-scope signing keys that give your agent permission to sign transactions for a defined period. When the session expires, the key is automatically revoked — your main wallet private key is never exposed to the agent.",
      },
      {
        q: "Is there an audit log?",
        a: "Yes. Every payment attempt — approved or blocked — is written to an immutable audit log. The log is append-only with a database-level trigger that prevents updates or deletes. You can query the full history from the dashboard.",
      },
    ],
  },
  {
    section: "Integration",
    items: [
      {
        q: "Which AI agent frameworks does x402Guard support?",
        a: "x402Guard has official plugins for ElizaOS, Virtuals Protocol, and Cod3x. Any agent using the x402 protocol can also be secured by routing payments through the x402Guard proxy endpoint.",
      },
      {
        q: "Which blockchains are supported?",
        a: "Base (EVM, including EIP-7702 session keys) and Solana (via Anchor program). Support for additional EVM chains is planned.",
      },
      {
        q: "How long does integration take?",
        a: "For ElizaOS, Virtuals, or Cod3x: install the plugin, set your proxy URL and guardrail config — about 5 minutes. For custom agents: configure your agent to route x402 payments through the x402Guard proxy endpoint instead of directly to the network.",
      },
    ],
  },
]

export function FAQContent() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      {/* Nav */}
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

      <main className="flex-1 py-20 px-6">
        <div className="mx-auto max-w-3xl">
          <div className="text-sm text-white/40 mb-4">
            <Link href="/" className="hover:text-white/70">x402Guard</Link>
            <span className="mx-2">/</span>
            <span>FAQ</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight mb-3">
            <GradientText
              colors={["#3b82f6", "#8b5cf6", "#ec4899", "#3b82f6"]}
              animationSpeed={7}
              className="text-4xl font-bold tracking-tight"
            >
              Frequently Asked Questions
            </GradientText>
          </h1>
          <p className="text-lg text-white/60 mb-16">
            Everything you need to know about x402Guard, the x402 protocol, and non-custodial AI agent security.
          </p>

          <div className="space-y-16">
            {faqs.map((section) => (
              <div key={section.section}>
                <div className="pb-3 border-b border-white/10 mb-6">
                  <ScrollFloat
                    containerClassName=""
                    textClassName="text-xl font-bold text-white/80"
                    animationDuration={1}
                    stagger={0.03}
                  >
                    {section.section}
                  </ScrollFloat>
                </div>
                <div className="space-y-8">
                  {section.items.map((item) => (
                    <div key={item.q}>
                      <h3 className="font-semibold mb-2">{item.q}</h3>
                      <p className="text-white/60 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* CTA card */}
          <div className="mt-20">
            <SpotlightCard className="p-8 text-center" spotlightColor="rgba(139,92,246,0.15)">
              <h2 className="text-2xl font-bold mb-3">Still have questions?</h2>
              <p className="text-white/60 mb-6">Open an issue on GitHub or check the full documentation.</p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link
                  href="https://github.com/DzikPasnik/x402Guard/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  <Github className="h-4 w-4" />
                  Open an issue
                </Link>
                <StarBorder as="div" className="cursor-pointer" color="#8b5cf6" speed="5s">
                  <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-0.5">
                    Launch Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </StarBorder>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

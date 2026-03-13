import type { Metadata } from "next"
import Link from "next/link"
import { Shield, ArrowRight, Github } from "lucide-react"

export const metadata: Metadata = {
  title: "FAQ — x402Guard AI Agent Security",
  description:
    "Frequently asked questions about x402Guard: how it works, what the x402 protocol is, how spend limits work, non-custodial security model, and how to integrate with ElizaOS and other AI agent frameworks.",
  keywords: [
    "x402Guard FAQ",
    "x402 protocol explained",
    "AI agent DeFi security FAQ",
    "how to secure AI agent DeFi",
    "non-custodial AI agent proxy",
    "ElizaOS DeFi security",
    "x402 payment protocol",
    "AI agent guardrails explained",
  ],
  alternates: {
    canonical: "https://x402guard.dev/faq",
  },
  openGraph: {
    title: "FAQ — x402Guard",
    description:
      "Answers to common questions about x402Guard, the x402 protocol, AI agent security, and non-custodial guardrails.",
    type: "article",
  },
}

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is x402Guard?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "x402Guard is a non-custodial safety proxy for autonomous AI agents that make DeFi payments using the x402 protocol. It enforces spend limits, contract whitelists, and session keys on every payment — without ever taking custody of your funds.",
      },
    },
    {
      "@type": "Question",
      name: "What is the x402 protocol?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "x402 is an HTTP payment protocol that allows AI agents and services to make machine-to-machine micropayments using stablecoins (primarily USDC). When an agent needs to pay for an API or service, it sends an HTTP 402 Payment Required response and the agent fulfills the payment automatically.",
      },
    },
    {
      "@type": "Question",
      name: "Is x402Guard custodial? Does it hold my funds?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. x402Guard is fully non-custodial. It never holds your private keys or your funds. It acts as a proxy that intercepts payment requests and enforces your rules before forwarding approved payments. Your agent's wallet and keys remain entirely under your control.",
      },
    },
    {
      "@type": "Question",
      name: "How do spend limits work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "x402Guard enforces two types of spend limits: a per-transaction cap (maximum USDC per single payment) and a daily cap (maximum total USDC across all payments in a 24-hour window). Both limits are checked atomically before any payment is forwarded to prevent race conditions.",
      },
    },
    {
      "@type": "Question",
      name: "What is a contract whitelist?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A contract whitelist is a list of approved smart contract addresses your agent is allowed to pay. Any payment attempt to an address not on the whitelist is blocked before it reaches the blockchain. x402Guard checks both the payment authority and the destination address.",
      },
    },
    {
      "@type": "Question",
      name: "What are EIP-7702 session keys?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "EIP-7702 session keys are temporary, limited-scope signing keys that give your AI agent permission to sign transactions on behalf of your wallet for a defined time period. When the session expires, the key is automatically revoked. This means your main wallet private key is never exposed to the agent.",
      },
    },
    {
      "@type": "Question",
      name: "Which AI agent frameworks does x402Guard support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "x402Guard supports ElizaOS, Virtuals Protocol, and Cod3x through official plugins. Any agent that makes x402 payments can also be secured by routing payments through the x402Guard proxy endpoint.",
      },
    },
    {
      "@type": "Question",
      name: "Which blockchains does x402Guard support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "x402Guard supports Base (EVM) and Solana. Base support includes full EIP-7702 session key functionality. Solana support is provided via a separate Anchor program.",
      },
    },
  ],
}

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
        a: "x402Guard is a mandatory proxy layer — your agent routes payments through it. If the agent tries to submit a transaction directly to the blockchain (bypassing the proxy), it would need to construct a valid x402 payment independently, which requires valid signing credentials. The session key design limits what an agent can sign even if compromised.",
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

export default function FAQPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

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
          <h1 className="text-4xl font-bold tracking-tight mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-white/60 mb-16">
            Everything you need to know about x402Guard, the x402 protocol, and non-custodial AI agent security.
          </p>

          <div className="space-y-16">
            {faqs.map((section) => (
              <div key={section.section}>
                <h2 className="text-xl font-bold mb-6 text-white/80 pb-3 border-b border-white/10">
                  {section.section}
                </h2>
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

          <div className="mt-20 rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <h2 className="text-2xl font-bold mb-3">Still have questions?</h2>
            <p className="text-white/60 mb-6">
              Open an issue on GitHub or check the full documentation.
            </p>
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
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md bg-white text-black px-5 py-2.5 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Launch Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

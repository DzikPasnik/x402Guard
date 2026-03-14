import type { Metadata } from "next"
import { FAQContent } from "./content"

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
        text: "x402Guard supports ElizaOS, Virtuals Protocol, Cod3x, and OpenClaw through official plugins. Any agent that makes x402 payments can also be secured by routing payments through the x402Guard proxy endpoint.",
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

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FAQContent />
    </>
  )
}

import type { Metadata } from "next"
import { HomeContent } from "./content"

export const metadata: Metadata = {
  title: "x402Guard — Guardrails for Autonomous DeFi Agents",
  description:
    "Non-custodial AI agent security proxy. Enforce spend limits, contract whitelists, and session keys on every DeFi payment your autonomous agent makes. Open-source guardrails for ElizaOS, Virtuals, and Cod3x on Base + Solana.",
  openGraph: {
    title: "x402Guard — Guardrails for Autonomous DeFi Agents",
    description:
      "Open-source AI agent security for DeFi. Spend limits, contract whitelists, session keys, immutable audit log. Non-custodial guardrails on Base + Solana.",
    type: "website",
    url: "https://x402guard.dev",
  },
  alternates: {
    canonical: "https://x402guard.dev",
  },
}

export default function HomePage() {
  return <HomeContent />
}

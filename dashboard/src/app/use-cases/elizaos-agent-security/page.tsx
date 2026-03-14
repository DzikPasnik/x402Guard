import type { Metadata } from "next"
import { ElizaOSContent } from "./content"

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

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://x402guard.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Use Cases",
      item: "https://x402guard.dev/use-cases",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "ElizaOS Agent Security",
      item: "https://x402guard.dev/use-cases/elizaos-agent-security",
    },
  ],
}

export default function ElizaOSAgentSecurityPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ElizaOSContent />
    </>
  )
}

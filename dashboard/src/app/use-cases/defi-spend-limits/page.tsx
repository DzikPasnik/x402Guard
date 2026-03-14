import type { Metadata } from "next"
import { DeFiSpendLimitsContent } from "./content"

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
      name: "DeFi Spend Limits",
      item: "https://x402guard.dev/use-cases/defi-spend-limits",
    },
  ],
}

export default function DeFiSpendLimitsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <DeFiSpendLimitsContent />
    </>
  )
}

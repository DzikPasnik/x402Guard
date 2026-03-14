import type { Metadata } from "next"
import AgentContent from "./content"

export const metadata: Metadata = {
  title: "Agent Demo — Interactive AI Security Chat",
  description:
    "Chat with an AI agent connected to the live x402Guard proxy. Simulate payments, check guardrail rules, view audit logs, and test spend limits in real-time on Base Sepolia.",
  keywords: [
    "x402Guard agent demo",
    "AI agent DeFi demo",
    "interactive security demo",
    "AI agent guardrails live",
    "x402 payment simulation",
    "DeFi agent chat",
  ],
  alternates: {
    canonical: "https://x402guard.dev/agent",
  },
  openGraph: {
    title: "Agent Demo — x402Guard",
    description:
      "Interactive AI agent connected to live x402Guard proxy. Simulate payments, check guardrails, and query audit logs.",
    type: "website",
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
      name: "Agent Demo",
      item: "https://x402guard.dev/agent",
    },
  ],
}

export default function AgentPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <AgentContent />
    </>
  )
}

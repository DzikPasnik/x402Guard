import type { Metadata } from "next"
import { ContractWhitelistContent } from "./content"

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
      name: "Contract Whitelist",
      item: "https://x402guard.dev/use-cases/contract-whitelist",
    },
  ],
}

export default function ContractWhitelistPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ContractWhitelistContent />
    </>
  )
}

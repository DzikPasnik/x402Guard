import type { Metadata } from "next"
import { DocsContent } from "./content"

export const metadata: Metadata = {
  title: "Documentation — x402Guard API Reference & Integration Guide",
  description:
    "Complete documentation for x402Guard: API reference, quick start guide, TypeScript SDK, ElizaOS plugin, OpenClaw plugin, Virtuals integration, guardrail configuration, session key management, and Solana vault setup.",
  keywords: [
    "x402Guard documentation",
    "x402Guard API reference",
    "x402Guard integration guide",
    "AI agent security API",
    "DeFi guardrails API",
    "ElizaOS plugin docs",
    "OpenClaw AI agent plugin",
    "x402 proxy setup",
    "EIP-7702 session keys docs",
    "AI agent spend limits API",
  ],
  alternates: {
    canonical: "https://x402guard.dev/docs",
  },
  openGraph: {
    title: "Documentation — x402Guard",
    description:
      "API reference, quick start guide, and integration docs for x402Guard — AI agent security proxy for DeFi.",
    type: "article",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "x402Guard Documentation — API Reference & Integration Guide",
  description:
    "API reference, quick start guide, and integration docs for x402Guard — AI agent security proxy for DeFi.",
  url: "https://x402guard.dev/docs",
  author: {
    "@type": "Organization",
    name: "x402Guard",
    url: "https://x402guard.dev",
  },
  publisher: {
    "@type": "Organization",
    name: "x402Guard",
    logo: { "@type": "ImageObject", url: "https://x402guard.dev/logo.png" },
  },
  datePublished: "2026-03-10",
  dateModified: "2026-03-14",
}

export default function DocsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocsContent />
    </>
  )
}

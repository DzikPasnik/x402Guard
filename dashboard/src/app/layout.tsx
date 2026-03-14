import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Web3Providers } from "@/components/providers/web3-provider";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://x402guard.dev";
const TITLE = "x402Guard — AI Agent Security & DeFi Guardrails";
const DESCRIPTION =
  "Non-custodial AI agent security proxy. Enforce spend limits, contract whitelists, and session keys on every DeFi payment your autonomous agent makes. Open-source guardrails for ElizaOS, Virtuals, Cod3x, and OpenClaw on Base + Solana.";
const OG_DESCRIPTION =
  "Open-source AI agent security for DeFi. Spend limits, contract whitelists, session keys, immutable audit log. Non-custodial guardrails for ElizaOS, Virtuals, Cod3x, OpenClaw on Base + Solana.";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | x402Guard",
  },
  description: DESCRIPTION,
  keywords: [
    "AI agent security",
    "DeFi agent guardrails",
    "autonomous agent safety",
    "AI agent spend limits",
    "DeFi agent security",
    "non-custodial AI proxy",
    "ElizaOS security plugin",
    "Virtuals agent guardrails",
    "OpenClaw AI agent plugin",
    "contract whitelist DeFi",
    "x402 protocol security",
    "EIP-7702 session keys",
    "Base blockchain agent",
    "Solana AI agent",
    "AI DeFi firewall",
    "autonomous agent guardrails",
  ],
  authors: [{ name: "x402Guard", url: SITE_URL }],
  openGraph: {
    title: TITLE,
    description: OG_DESCRIPTION,
    type: "website",
    url: SITE_URL,
    siteName: "x402Guard",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: OG_DESCRIPTION,
  },
  alternates: {
    canonical: SITE_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "x402Guard",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  license: "https://opensource.org/licenses/MIT",
  codeRepository: "https://github.com/DzikPasnik/x402Guard",
  featureList: [
    "AI agent spend limits",
    "Contract address whitelist",
    "EIP-7702 session keys",
    "Immutable audit log",
    "ElizaOS plugin",
    "Virtuals protocol integration",
    "Base blockchain support",
    "Solana support",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PostHogProvider>
          <Web3Providers>
            {children}
          </Web3Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}

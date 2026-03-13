import type { Metadata } from "next";
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
const TITLE = "x402Guard — Guardrails for Autonomous DeFi Agents";
const DESCRIPTION =
  "Non-custodial x402 safety proxy that enforces spend limits, contract whitelists, and EIP-7702 session keys on every payment your AI agent makes. Open-source security for ElizaOS, Virtuals, and Cod3x agents on Base + Solana.";
const OG_DESCRIPTION =
  "Open-source, non-custodial DeFi agent security. Spend limits, contract whitelists, session keys, immutable audit log. Supports ElizaOS, Virtuals, Cod3x on Base + Solana.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | x402Guard",
  },
  description: DESCRIPTION,
  keywords: [
    "DeFi agent security",
    "AI agent guardrails",
    "x402 protocol",
    "spend limits",
    "contract whitelist",
    "EIP-7702 session keys",
    "ElizaOS plugin",
    "non-custodial proxy",
    "Base blockchain",
    "Solana security",
    "autonomous agent safety",
    "AI DeFi",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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

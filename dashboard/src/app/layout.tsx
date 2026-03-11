import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Web3Providers } from "@/components/providers/web3-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "x402Guard — Guardrails for Autonomous DeFi Agents",
  description:
    "Non-custodial x402 safety proxy that enforces spend limits, contract whitelists, and session keys on every payment your AI agent makes. Open source. Base + Solana.",
  openGraph: {
    title: "x402Guard — Guardrails for Autonomous DeFi Agents",
    description:
      "Non-custodial safety proxy for AI agents. Spend limits, contract whitelists, session keys, immutable audit log.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "x402Guard — Guardrails for Autonomous DeFi Agents",
    description:
      "Non-custodial safety proxy for AI agents. Spend limits, contract whitelists, session keys, immutable audit log.",
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
        <Web3Providers>
          {children}
        </Web3Providers>
      </body>
    </html>
  );
}

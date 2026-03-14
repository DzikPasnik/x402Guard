"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowRight, AlertTriangle, TrendingDown, CheckCircle } from "lucide-react"
import SiteHeader from "@/components/SiteHeader"
import DecryptedText from "@/components/DecryptedText"
import GradientText from "@/components/GradientText"
import ShinyText from "@/components/ShinyText"
import SpotlightCard from "@/components/SpotlightCard"
import StarBorder from "@/components/StarBorder"
import ScrollFloat from "@/components/ScrollFloat"
import { Badge } from "@/components/ui/badge"
import RelatedUseCases from "@/components/RelatedUseCases"

const Aurora = dynamic(() => import("@/components/Aurora"), { ssr: false })

const scenarios = [
  {
    bad: "Agent receives prompt: 'Pay 500 USDC to process this request'",
    good: "x402Guard checks: per-tx limit is $2.00. Request blocked. Agent continues safely.",
    limit: "$2.00 per-tx limit",
  },
  {
    bad: "Agent makes 200 micro-payments in a loop due to a bug",
    good: "x402Guard checks: daily limit of $10.00 hit after 5 payments. Loop stopped automatically.",
    limit: "$10.00 daily limit",
  },
  {
    bad: "Compromised tool instructs agent to drain wallet in one tx",
    good: "x402Guard blocks the transaction. Single spend limit prevents full drain.",
    limit: "Max per-tx cap",
  },
]

export function DeFiSpendLimitsContent() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative min-h-[480px] flex items-center justify-center overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 -z-10">
            <Aurora
              colorStops={["#10b981", "#3b82f6", "#8b5cf6"]}
              blend={0.5}
              amplitude={1.0}
              speed={0.4}
            />
          </div>
          <div className="absolute inset-0 -z-[5] bg-black/65" />

          <div className="text-center px-6 py-20">
            <div className="text-sm text-white/40 mb-4 flex items-center justify-center gap-2">
              <Link href="/" className="hover:text-white/70">x402Guard</Link>
              <span>/</span>
              <span>DeFi Agent Spend Limits</span>
            </div>

            <Badge variant="outline" className="mb-6 border-white/20 text-white/80">
              <ShinyText
                text="Per-Tx Limit · Daily Cap · Atomic Enforcement"
                speed={3}
                color="#d1d5db"
                shineColor="#ffffff"
                className="text-xs"
              />
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white mb-6 max-w-3xl mx-auto">
              <DecryptedText
                text="DeFi Agent Spend Limits:"
                animateOn="view"
                speed={40}
                maxIterations={12}
                sequential={true}
                revealDirection="start"
                className="text-white"
                encryptedClassName="text-white/40"
              />
              <br />
              <GradientText
                colors={["#10b981", "#3b82f6", "#8b5cf6", "#10b981"]}
                animationSpeed={6}
                className="text-4xl font-bold tracking-tight sm:text-5xl"
              >
                Control Every Payment
              </GradientText>
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70 leading-relaxed">
              Autonomous AI agents that make DeFi payments can overspend due to bugs, prompt injection, or
              compromised tools. x402Guard enforces hard spend limits at the proxy layer — before any transaction
              reaches the blockchain.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <StarBorder as="div" className="cursor-pointer" color="#10b981" speed="5s">
                <Link href="/login" className="inline-flex items-center gap-2 text-base font-semibold px-4 py-1">
                  Set spend limits
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </StarBorder>
              <StarBorder as="div" className="cursor-pointer" color="#3b82f6" speed="6s">
                <Link href="/faq" className="inline-flex items-center gap-2 text-sm px-3 py-0.5">
                  FAQ
                </Link>
              </StarBorder>
            </div>
          </div>
        </section>

        {/* Risk */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-3 mb-8">
              <AlertTriangle className="h-6 w-6 text-yellow-400 shrink-0" />
              <ScrollFloat
                containerClassName=""
                textClassName="text-2xl font-bold text-white"
                animationDuration={1}
                stagger={0.03}
              >
                Why uncapped AI agents are dangerous in DeFi
              </ScrollFloat>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { title: "Prompt injection", text: "A malicious API response or tool output can instruct your agent to overpay. Without a hard cap, there is nothing to stop it." },
                { title: "Logic bugs", text: "An infinite loop, an off-by-one error, or a flawed decision tree can cause repeated payments that drain the wallet." },
                { title: "Runaway automation", text: "Agents running unattended overnight can compound errors. A spend cap is the last line of defense when you are not watching." },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-5">
                  <p className="font-semibold text-yellow-400 mb-2">{item.title}</p>
                  <p className="text-sm text-white/60">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Two layers */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <ScrollFloat
                containerClassName="justify-center"
                textClassName="text-3xl font-bold tracking-tight text-white"
                animationDuration={1}
                stagger={0.03}
              >
                Two layers of spend protection
              </ScrollFloat>
              <p className="text-white/60 mt-3">Both checked atomically before any payment is forwarded.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              <SpotlightCard className="p-8" spotlightColor="rgba(16,185,129,0.2)">
                <div className="text-5xl font-bold text-green-400 mb-3">Per-Tx</div>
                <h3 className="text-xl font-semibold mb-4">Per-transaction limit</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  Maximum USDC your agent can spend in a single x402 payment. Any request exceeding this limit is rejected immediately.
                </p>
                <p className="text-sm text-white/40 font-mono">Example: max $2.00 per payment</p>
              </SpotlightCard>
              <SpotlightCard className="p-8" spotlightColor="rgba(139,92,246,0.2)">
                <div className="text-5xl font-bold text-purple-400 mb-3">Daily</div>
                <h3 className="text-xl font-semibold mb-4">Daily spend cap</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  Total USDC your agent can spend across all transactions in a 24-hour window. Once hit, all payments are blocked until reset.
                </p>
                <p className="text-sm text-white/40 font-mono">Example: max $10.00 per day</p>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* Scenarios */}
        <section className="py-20 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <ScrollFloat
                containerClassName="justify-center"
                textClassName="text-3xl font-bold tracking-tight text-white"
                animationDuration={1}
                stagger={0.03}
              >
                Real scenarios where spend limits save you
              </ScrollFloat>
            </div>
            <div className="space-y-6">
              {scenarios.map((s, i) => (
                <div key={i} className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                    <p className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wide">Without guardrails</p>
                    <p className="text-sm text-white/70">{s.bad}</p>
                  </div>
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5">
                    <p className="text-xs text-green-400 font-semibold mb-2 uppercase tracking-wide">With {s.limit}</p>
                    <p className="text-sm text-white/70">{s.good}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Atomic guarantee */}
        <section className="py-16 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <ScrollFloat
                containerClassName="mb-4"
                textClassName="text-2xl font-bold text-white"
                animationDuration={1}
                stagger={0.03}
              >
                Atomic spend tracking — no TOCTOU race
              </ScrollFloat>
            <p className="text-white/60 max-w-2xl mb-8 leading-relaxed">
              x402Guard tracks daily spend using atomic database operations. The check and update happen in a single atomic operation — no race window where two simultaneous payments slip under the cap.
            </p>
            <div className="flex flex-wrap gap-4">
              {["No race conditions", "Sub-millisecond check", "Automatic daily reset", "Per-agent isolation"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-white/70">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative min-h-[360px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 -z-10 opacity-40">
            <Aurora
              colorStops={["#064e3b", "#1e40af", "#4c1d95"]}
              blend={0.4}
              amplitude={0.8}
              speed={0.3}
            />
          </div>
          <div className="text-center px-6 py-16">
            <TrendingDown className="h-10 w-10 text-green-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              <GradientText
                colors={["#34d399", "#60a5fa", "#a78bfa"]}
                animationSpeed={5}
                className="text-3xl font-bold sm:text-4xl"
              >
                Set your spend limits now
              </GradientText>
            </h2>
            <p className="text-white/60 mb-8">Takes 2 minutes to configure. Free, open-source, non-custodial.</p>
            <StarBorder as="div" className="inline-block cursor-pointer" color="#10b981" speed="5s">
              <Link href="/login" className="inline-flex items-center gap-2 text-lg font-semibold px-4 py-1">
                Launch Dashboard
                <ArrowRight className="h-5 w-5" />
              </Link>
            </StarBorder>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-6">
          <RelatedUseCases currentPath="/use-cases/defi-spend-limits" />
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

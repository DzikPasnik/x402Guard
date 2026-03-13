"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { Shield, ArrowRight, Github, Lock, Eye, FileCheck, Timer } from "lucide-react"
import DecryptedText from "@/components/DecryptedText"
import GradientText from "@/components/GradientText"
import ShinyText from "@/components/ShinyText"
import SpotlightCard from "@/components/SpotlightCard"
import StarBorder from "@/components/StarBorder"
import ScrollFloat from "@/components/ScrollFloat"
import { Badge } from "@/components/ui/badge"

const Aurora = dynamic(() => import("@/components/Aurora"), { ssr: false })

const benefits = [
  {
    icon: Shield,
    color: "rgba(59,130,246,0.25)",
    iconClass: "text-blue-400",
    title: "Per-transaction spend limits",
    description:
      "Cap how much USDC your ElizaOS agent can spend in a single x402 transaction. If the agent tries to pay more, x402Guard blocks it at the proxy layer — no on-chain transaction is ever submitted.",
  },
  {
    icon: FileCheck,
    color: "rgba(139,92,246,0.25)",
    iconClass: "text-purple-400",
    title: "Contract address whitelist",
    description:
      "Explicitly approve which smart contract addresses your ElizaOS agent is allowed to interact with. Any payment attempt to an unapproved address is rejected before it reaches the network.",
  },
  {
    icon: Timer,
    color: "rgba(6,182,212,0.25)",
    iconClass: "text-cyan-400",
    title: "Auto-expiring session keys",
    description:
      "EIP-7702 session keys give your ElizaOS agent limited signing authority that expires automatically. When the session ends, the key is revoked — your main wallet is never exposed.",
  },
  {
    icon: Eye,
    color: "rgba(236,72,153,0.25)",
    iconClass: "text-pink-400",
    title: "Immutable audit log",
    description:
      "Every payment attempt — approved or blocked — is logged in an append-only audit trail. See exactly what your ElizaOS agent tried to spend, when, and why it was allowed or rejected.",
  },
]

const steps = [
  {
    step: "1",
    title: "Install the x402Guard ElizaOS plugin",
    code: "npm install @x402guard/elizaos-plugin",
  },
  {
    step: "2",
    title: "Configure your guardrail rules",
    code: `// elizaos.config.ts
x402Guard: {
  proxyUrl: "https://your-guard.x402guard.dev",
  spendLimitPerTx: "1.00",   // USDC
  dailySpendLimit: "10.00",  // USDC
  allowedContracts: ["0x..."],
}`,
  },
  {
    step: "3",
    title: "Your agent runs, guardrails enforce",
    code: `// Every x402 payment goes through x402Guard
// Exceeds limit? Blocked. Unknown contract? Blocked.
// Clean payment? Forwarded. All logged.`,
  },
]

export function ElizaOSContent() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#09090b]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-bold">x402Guard</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="https://github.com/DzikPasnik/x402Guard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/50 hover:text-white flex items-center gap-1.5"
            >
              <Github className="h-4 w-4" />
              GitHub
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              Launch Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero with Aurora */}
        <section className="relative min-h-[480px] flex items-center justify-center overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 -z-10">
            <Aurora
              colorStops={["#3b82f6", "#8b5cf6", "#06b6d4"]}
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
              <span>ElizaOS Agent Security</span>
            </div>

            <Badge variant="outline" className="mb-6 border-white/20 text-white/80">
              <ShinyText
                text="ElizaOS · Non-Custodial · Base + Solana"
                speed={3}
                color="#d1d5db"
                shineColor="#ffffff"
                className="text-xs"
              />
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white mb-6 max-w-3xl mx-auto">
              <DecryptedText
                text="ElizaOS Agent Security"
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
                colors={["#3b82f6", "#8b5cf6", "#ec4899", "#3b82f6"]}
                animationSpeed={6}
                className="text-4xl font-bold tracking-tight sm:text-5xl"
              >
                with Non-Custodial Guardrails
              </GradientText>
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70 leading-relaxed">
              x402Guard adds a non-custodial safety layer between your ElizaOS agent and the blockchain —
              enforcing spend limits, contract whitelists, and session keys without ever taking custody of your funds.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <StarBorder as="div" className="cursor-pointer" color="#8b5cf6" speed="5s">
                <Link href="/login" className="inline-flex items-center gap-2 text-base font-semibold px-4 py-1">
                  Set up guardrails
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </StarBorder>
              <StarBorder as="div" className="cursor-pointer" color="#3b82f6" speed="6s">
                <Link
                  href="https://github.com/DzikPasnik/x402Guard/tree/main/examples/elizaos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm px-3 py-0.5"
                >
                  <Github className="h-4 w-4" />
                  View ElizaOS example
                </Link>
              </StarBorder>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <ScrollFloat
              containerClassName="mb-8"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              The problem with unguarded ElizaOS agents
            </ScrollFloat>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { title: "No spend cap", text: "A buggy prompt or compromised tool can instruct your agent to drain its entire wallet in one transaction." },
                { title: "No contract control", text: "Nothing stops your agent from paying a malicious contract address injected via prompt manipulation." },
                { title: "No audit trail", text: "When something goes wrong, you have no log of what the agent tried to do or why funds moved." },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                  <p className="font-semibold text-red-400 mb-2">{item.title}</p>
                  <p className="text-sm text-white/60">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features via SpotlightCards */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <ScrollFloat
                containerClassName="justify-center"
                textClassName="text-3xl font-bold tracking-tight sm:text-4xl text-white"
                animationDuration={1}
                stagger={0.03}
              >
                What x402Guard adds to your ElizaOS agent
              </ScrollFloat>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {benefits.map((benefit) => {
                const Icon = benefit.icon
                return (
                  <SpotlightCard key={benefit.title} className="p-6" spotlightColor={benefit.color}>
                    <Icon className={`h-7 w-7 ${benefit.iconClass} mb-4`} />
                    <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
                    <p className="text-sm text-white/60 leading-relaxed">{benefit.description}</p>
                  </SpotlightCard>
                )
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <ScrollFloat
                containerClassName="justify-center"
                textClassName="text-3xl font-bold tracking-tight text-white"
                animationDuration={1}
                stagger={0.03}
              >
                How to add guardrails to your ElizaOS agent
              </ScrollFloat>
            </div>
            <div className="space-y-8">
              {steps.map((item) => (
                <div key={item.step} className="flex gap-6">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-sm font-bold text-blue-400">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-3">{item.title}</h3>
                    <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm text-white/70 overflow-x-auto">
                      <code>{item.code}</code>
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Non-custodial facts */}
        <section className="py-16 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <ScrollFloat
              containerClassName="mb-8"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Non-custodial by design
            </ScrollFloat>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Lock, text: "x402Guard never holds your private keys", color: "text-green-400" },
                { icon: Shield, text: "Guardrails run server-side, funds stay on-chain", color: "text-blue-400" },
                { icon: Eye, text: "Open-source — audit the code yourself", color: "text-purple-400" },
                { icon: FileCheck, text: "Every decision is logged and queryable", color: "text-cyan-400" },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.text} className="flex items-start gap-3 rounded-lg border border-white/10 p-4">
                    <Icon className={`h-5 w-5 ${item.color} mt-0.5 shrink-0`} />
                    <p className="text-sm text-white/70">{item.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* CTA with Aurora */}
        <section className="relative min-h-[360px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 -z-10 opacity-40">
            <Aurora
              colorStops={["#1e40af", "#7c3aed", "#0891b2"]}
              blend={0.4}
              amplitude={0.8}
              speed={0.3}
            />
          </div>
          <div className="text-center px-6 py-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              <GradientText
                colors={["#60a5fa", "#a78bfa", "#f472b6"]}
                animationSpeed={5}
                className="text-3xl font-bold sm:text-4xl"
              >
                Protect your ElizaOS agent today
              </GradientText>
            </h2>
            <p className="text-white/60 mb-8">Set up guardrail rules in minutes. Free and open-source under MIT License.</p>
            <StarBorder as="div" className="inline-block cursor-pointer" color="#a78bfa" speed="5s">
              <Link href="/login" className="inline-flex items-center gap-2 text-lg font-semibold px-4 py-1">
                Launch Dashboard
                <ArrowRight className="h-5 w-5" />
              </Link>
            </StarBorder>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowRight, FileCheck, Lock, XCircle, CheckCircle } from "lucide-react"
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

const attacks = [
  {
    name: "Prompt injection",
    description:
      "A malicious API response or injected tool output tells your agent to pay a new, unknown contract address. Without a whitelist, the agent complies.",
  },
  {
    name: "Address substitution",
    description:
      "The agent's internal state is manipulated to replace a known contract address with an attacker-controlled one.",
  },
  {
    name: "Phishing via tools",
    description:
      "A compromised tool returns a fake contract address that looks legitimate but routes funds to an attacker.",
  },
]

export function ContractWhitelistContent() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative min-h-[480px] flex items-center justify-center overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 -z-10">
            <Aurora
              colorStops={["#7c3aed", "#dc2626", "#ec4899"]}
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
              <span>Contract Whitelist</span>
            </div>

            <Badge variant="outline" className="mb-6 border-white/20 text-white/80">
              <ShinyText
                text="Dual Authority + Address Check · Zero Trust"
                speed={3}
                color="#d1d5db"
                shineColor="#ffffff"
                className="text-xs"
              />
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-white mb-6 max-w-3xl mx-auto">
              <DecryptedText
                text="Contract Whitelist:"
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
                colors={["#c084fc", "#f87171", "#ec4899", "#c084fc"]}
                animationSpeed={6}
                className="text-4xl font-bold tracking-tight sm:text-5xl"
              >
                Only Approved Addresses
              </GradientText>
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70 leading-relaxed">
              x402Guard&apos;s contract whitelist ensures your agent can only send funds to explicitly approved
              addresses — any other payment attempt is blocked before it hits the blockchain.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <StarBorder as="div" className="cursor-pointer" color="#7c3aed" speed="5s">
                <Link href="/login" className="inline-flex items-center gap-2 text-base font-semibold px-4 py-1">
                  Configure whitelist
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </StarBorder>
              <StarBorder as="div" className="cursor-pointer" color="#ec4899" speed="6s">
                <Link href="/faq" className="inline-flex items-center gap-2 text-sm px-3 py-0.5">
                  FAQ
                </Link>
              </StarBorder>
            </div>
          </div>
        </section>

        {/* Attack vectors */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <ScrollFloat
                containerClassName="mb-8"
                textClassName="text-2xl font-bold text-white"
                animationDuration={1}
                stagger={0.03}
              >
                How AI agents get tricked into paying wrong addresses
              </ScrollFloat>
            <div className="grid gap-6 sm:grid-cols-3">
              {attacks.map((attack) => (
                <SpotlightCard key={attack.name} className="p-5" spotlightColor="rgba(220,38,38,0.15)">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                    <p className="font-semibold text-red-400">{attack.name}</p>
                  </div>
                  <p className="text-sm text-white/60">{attack.description}</p>
                </SpotlightCard>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 border-b border-white/10">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <ScrollFloat
                containerClassName="justify-center"
                textClassName="text-3xl font-bold tracking-tight text-white"
                animationDuration={1}
                stagger={0.03}
              >
                How the contract whitelist works
              </ScrollFloat>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 items-start">
              <div className="space-y-6">
                {[
                  { n: "1", color: "green", title: "You define approved addresses", text: "In the x402Guard dashboard, create a list of contract addresses your agent is permitted to pay. These are the only valid payment destinations." },
                  { n: "2", color: "green", title: "Agent initiates a payment", text: "When your agent calls the x402 endpoint, x402Guard intercepts the request before it reaches any blockchain node." },
                  { n: "3", color: "green", title: "Address is checked against whitelist", text: "x402Guard checks both the contract address AND the token authority. Both must be on the approved list." },
                  { n: "4", color: "blue", title: "Approved or blocked, always logged", text: "Whether forwarded or rejected, the decision is written to the immutable audit log with timestamp and reason." },
                ].map((item) => (
                  <div key={item.n} className="flex gap-4">
                    <div className={`shrink-0 w-8 h-8 rounded-full bg-${item.color}-500/20 border border-${item.color}-500/40 flex items-center justify-center text-sm font-bold text-${item.color}-400`}>
                      {item.n}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{item.title}</h3>
                      <p className="text-sm text-white/60">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 font-mono text-sm space-y-3">
                <p className="text-white/40 text-xs mb-4">// x402Guard rule config</p>
                <div className="space-y-1">
                  <p className="text-purple-400">allowed_contracts: [</p>
                  <p className="text-green-400 pl-4">&quot;0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&quot;, <span className="text-white/40">// USDC</span></p>
                  <p className="text-green-400 pl-4">&quot;0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&quot;, <span className="text-white/40">// USDC Base</span></p>
                  <p className="text-purple-400">]</p>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-white/60">Payment to 0xA0b8... → <span className="text-green-400">APPROVED</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-white/60">Payment to 0xDEAD... → <span className="text-red-400">BLOCKED</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dual check */}
        <section className="py-16 px-6 border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl">
            <ScrollFloat
                containerClassName="mb-4"
                textClassName="text-2xl font-bold text-white"
                animationDuration={1}
                stagger={0.03}
              >
                Dual authority + address check
              </ScrollFloat>
            <p className="text-white/60 max-w-2xl mb-8 leading-relaxed">
              x402Guard validates both the payment facilitator authority and the destination contract address.
              An attacker cannot bypass the whitelist by changing one while leaving the other intact.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <SpotlightCard className="p-5" spotlightColor="rgba(59,130,246,0.15)">
                <FileCheck className="h-5 w-5 text-blue-400 mb-3" />
                <p className="font-semibold text-sm mb-1">Authority check</p>
                <p className="text-xs text-white/50">Verifies the payment facilitator authority matches your approved list</p>
              </SpotlightCard>
              <SpotlightCard className="p-5" spotlightColor="rgba(139,92,246,0.15)">
                <Lock className="h-5 w-5 text-purple-400 mb-3" />
                <p className="font-semibold text-sm mb-1">Address check</p>
                <p className="text-xs text-white/50">Verifies the destination contract address is on the approved list</p>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative min-h-[360px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 -z-10 opacity-40">
            <Aurora
              colorStops={["#4c1d95", "#7f1d1d", "#831843"]}
              blend={0.4}
              amplitude={0.8}
              speed={0.3}
            />
          </div>
          <div className="text-center px-6 py-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              <GradientText
                colors={["#c084fc", "#f87171", "#f472b6"]}
                animationSpeed={5}
                className="text-3xl font-bold sm:text-4xl"
              >
                Whitelist your contracts today
              </GradientText>
            </h2>
            <p className="text-white/60 mb-8">Free, open-source, non-custodial. Your funds, your rules.</p>
            <StarBorder as="div" className="inline-block cursor-pointer" color="#7c3aed" speed="5s">
              <Link href="/login" className="inline-flex items-center gap-2 text-lg font-semibold px-4 py-1">
                Launch Dashboard
                <ArrowRight className="h-5 w-5" />
              </Link>
            </StarBorder>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-6">
          <RelatedUseCases currentPath="/use-cases/contract-whitelist" />
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

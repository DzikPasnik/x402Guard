"use client"

import dynamic from "next/dynamic"
import CountUp from "@/components/CountUp"
import GradientText from "@/components/GradientText"
import DecryptedText from "@/components/DecryptedText"
import ShinyText from "@/components/ShinyText"
import SpotlightCard from "@/components/SpotlightCard"
import StarBorder from "@/components/StarBorder"
import ScrollFloat from "@/components/ScrollFloat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Shield,
  ArrowRight,
  Github,
  Lock,
  Eye,
  Code2,
  Zap,
  FileCheck,
  Timer,
  Layers,
} from "lucide-react"
import Link from "next/link"

// Aurora uses WebGL (ogl) — must be client-only, no SSR
const Aurora = dynamic(() => import("@/components/Aurora"), { ssr: false })

export default function Playground() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#09090b]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-bold">x402Guard</span>
            <Badge variant="secondary" className="text-[10px] bg-white/10 text-white/70 border-0">PLAYGROUND v2</Badge>
          </div>
          <Link href="/" className="text-sm text-white/50 hover:text-white">
            Back to Landing Page
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ============================================ */}
        {/* SECTION 1: ShinyText Demo                    */}
        {/* ============================================ */}
        <section className="border-b border-white/10 py-20 px-6 text-center">
          <p className="text-sm font-medium text-white/40 mb-8">✨ SHINY TEXT — Animated shine sweep effect</p>
          <div className="space-y-6">
            <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
              <ShinyText
                text="Non-Custodial DeFi Security"
                speed={3}
                color="#888888"
                shineColor="#ffffff"
                spread={120}
                className="text-4xl font-bold tracking-tight sm:text-6xl"
              />
            </h2>
            <p className="text-lg text-white/50">Great for section headers, badges, or emphasis text</p>
            <div className="flex justify-center gap-4">
              <Badge variant="outline" className="border-white/20 text-white/70 px-4 py-1.5">
                <ShinyText text="Open Source" speed={2} color="#9ca3af" shineColor="#e5e7eb" className="text-sm" />
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/70 px-4 py-1.5">
                <ShinyText text="Battle Tested" speed={2.5} color="#9ca3af" shineColor="#e5e7eb" className="text-sm" />
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/70 px-4 py-1.5">
                <ShinyText text="106+ Tests" speed={3} color="#9ca3af" shineColor="#e5e7eb" className="text-sm" />
              </Badge>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION 2: SpotlightCard Demo                */}
        {/* ============================================ */}
        <section className="border-b border-white/10 py-20 px-6">
          <p className="text-sm font-medium text-white/40 mb-8 text-center">🔦 SPOTLIGHT CARDS — Hover to see the light effect</p>
          <div className="mx-auto max-w-6xl grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <SpotlightCard className="p-6" spotlightColor="rgba(59, 130, 246, 0.25)">
              <Shield className="h-8 w-8 text-blue-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Spend Limits</h3>
              <p className="text-sm text-white/60">Per-tx and daily caps enforced at the proxy layer. Agents never exceed your budget.</p>
            </SpotlightCard>

            <SpotlightCard className="p-6" spotlightColor="rgba(139, 92, 246, 0.25)">
              <FileCheck className="h-8 w-8 text-purple-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Contract Whitelist</h3>
              <p className="text-sm text-white/60">Only approved contract addresses can receive funds. Block rogue transfers.</p>
            </SpotlightCard>

            <SpotlightCard className="p-6" spotlightColor="rgba(6, 182, 212, 0.25)">
              <Timer className="h-8 w-8 text-cyan-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Session Keys</h3>
              <p className="text-sm text-white/60">Time-bound EIP-7702 session keys. Auto-expire, auto-revoke.</p>
            </SpotlightCard>

            <SpotlightCard className="p-6" spotlightColor="rgba(236, 72, 153, 0.25)">
              <Layers className="h-8 w-8 text-pink-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Audit Trail</h3>
              <p className="text-sm text-white/60">Immutable log of every transaction. Full visibility into agent spending.</p>
            </SpotlightCard>
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION 3: StarBorder Button Demo            */}
        {/* ============================================ */}
        <section className="border-b border-white/10 py-20 px-6 text-center">
          <p className="text-sm font-medium text-white/40 mb-8">⭐ STAR BORDER — Animated glowing border for CTAs</p>
          <div className="flex flex-col items-center gap-6">
            <StarBorder
              as="a"
              className="inline-flex items-center gap-2 text-lg font-semibold px-8 py-3 cursor-pointer"
              color="#8b5cf6"
              speed="5s"
            >
              Launch Dashboard
              <ArrowRight className="h-5 w-5" />
            </StarBorder>

            <div className="flex gap-4">
              <StarBorder
                as="a"
                className="inline-flex items-center gap-2 text-sm px-5 py-2 cursor-pointer"
                color="#3b82f6"
                speed="6s"
              >
                <Github className="h-4 w-4" />
                View Source
              </StarBorder>
              <StarBorder
                as="a"
                className="inline-flex items-center gap-2 text-sm px-5 py-2 cursor-pointer"
                color="#06b6d4"
                speed="4s"
              >
                Read Docs
              </StarBorder>
            </div>
            <p className="text-sm text-white/40 mt-2">Works great as a replacement for outline buttons</p>
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION 4: ScrollFloat Demo                  */}
        {/* ============================================ */}
        <section className="border-b border-white/10 py-32 px-6 text-center">
          <p className="text-sm font-medium text-white/40 mb-16">🎈 SCROLL FLOAT — Text animates in as you scroll (scroll down!)</p>
          <div className="space-y-16">
            <ScrollFloat
              containerClassName="justify-center"
              textClassName="text-4xl font-bold tracking-tight sm:text-6xl text-white"
              animationDuration={1}
              ease="back.inOut(2)"
              stagger={0.03}
            >
              AI agents can spend money.
            </ScrollFloat>
            <ScrollFloat
              containerClassName="justify-center"
              textClassName="text-4xl font-bold tracking-tight sm:text-6xl text-purple-400"
              animationDuration={1.2}
              ease="back.inOut(2)"
              stagger={0.04}
            >
              Who watches them?
            </ScrollFloat>
          </div>
        </section>

        {/* ============================================ */}
        {/* SECTION 5: Combined Demo - Full Landing Hero */}
        {/* ============================================ */}
        <section className="relative min-h-[700px] flex items-center justify-center overflow-hidden">
          {/* Aurora BG */}
          <div className="absolute inset-0 -z-10">
            <Aurora
              colorStops={["#3b82f6", "#8b5cf6", "#06b6d4"]}
              blend={0.6}
              amplitude={1.2}
              speed={0.5}
            />
          </div>
          <div className="absolute inset-0 -z-[5] bg-black/60" />

          <div className="text-center px-6 py-24">
            <Badge variant="outline" className="mb-6 border-white/20 text-white/80">
              <ShinyText text="Open Source · Non-Custodial · Base + Solana" speed={3} color="#d1d5db" shineColor="#ffffff" className="text-xs" />
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-white">
              <DecryptedText
                text="Guardrails for"
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
                className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
              >
                Autonomous DeFi Agents
              </GradientText>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70 leading-relaxed sm:text-xl">
              x402Guard is a non-custodial safety proxy that enforces spend limits,
              contract whitelists, and session keys on every x402 payment your AI agent makes.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <StarBorder
                as="a"
                className="inline-flex items-center gap-2 text-lg font-semibold px-8 py-3 cursor-pointer"
                color="#8b5cf6"
                speed="5s"
              >
                Launch Dashboard
                <ArrowRight className="h-5 w-5" />
              </StarBorder>
              <StarBorder
                as="a"
                className="inline-flex items-center gap-2 text-sm px-6 py-2.5 cursor-pointer"
                color="#3b82f6"
                speed="6s"
              >
                <Github className="h-4 w-4" />
                View Source
              </StarBorder>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-white/70">
              <div className="flex items-center gap-2 text-sm">
                <Lock className="h-4 w-4" />
                <span>Non-Custodial</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Eye className="h-4 w-4" />
                <span>Fully Audited</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Code2 className="h-4 w-4" />
                <span>Open Source</span>
              </div>
            </div>
          </div>
        </section>

        {/* Stats with CountUp */}
        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-8 sm:grid-cols-4 text-center">
              <div>
                <div className="text-4xl font-bold">
                  <CountUp to={106} duration={2} className="tabular-nums" />
                  <span>+</span>
                </div>
                <p className="mt-1 text-sm text-white/50">Proxy Tests</p>
              </div>
              <div>
                <div className="text-4xl font-bold">
                  <CountUp to={6} duration={1.5} className="tabular-nums" />
                </div>
                <p className="mt-1 text-sm text-white/50">Critical Fixes Shipped</p>
              </div>
              <div>
                <div className="text-4xl font-bold">
                  <CountUp to={9} duration={1.5} className="tabular-nums" />
                  <span>/</span>
                  <CountUp to={9} duration={1.5} className="tabular-nums" />
                </div>
                <p className="mt-1 text-sm text-white/50">Beta Scenarios Passing</p>
              </div>
              <div>
                <div className="text-4xl font-bold">
                  <CountUp to={4} duration={1.5} className="tabular-nums" />
                </div>
                <p className="mt-1 text-sm text-white/50">Agent Frameworks Supported</p>
              </div>
            </div>
          </div>
        </section>

        {/* SpotlightCards features */}
        <section className="py-20 px-6">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <ScrollFloat
                containerClassName="justify-center"
                textClassName="text-3xl font-bold tracking-tight sm:text-5xl text-white"
                animationDuration={1}
                stagger={0.03}
              >
                How It Works
              </ScrollFloat>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <SpotlightCard className="p-6" spotlightColor="rgba(59, 130, 246, 0.25)">
                <Shield className="h-8 w-8 text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Spend Limits</h3>
                <p className="text-sm text-white/60">Per-tx and daily caps enforced at the proxy layer. Agents never exceed your budget.</p>
              </SpotlightCard>
              <SpotlightCard className="p-6" spotlightColor="rgba(139, 92, 246, 0.25)">
                <FileCheck className="h-8 w-8 text-purple-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Contract Whitelist</h3>
                <p className="text-sm text-white/60">Only approved contract addresses can receive funds. Block rogue transfers.</p>
              </SpotlightCard>
              <SpotlightCard className="p-6" spotlightColor="rgba(6, 182, 212, 0.25)">
                <Timer className="h-8 w-8 text-cyan-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Session Keys</h3>
                <p className="text-sm text-white/60">Time-bound EIP-7702 session keys. Auto-expire, auto-revoke.</p>
              </SpotlightCard>
              <SpotlightCard className="p-6" spotlightColor="rgba(236, 72, 153, 0.25)">
                <Layers className="h-8 w-8 text-pink-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Audit Trail</h3>
                <p className="text-sm text-white/60">Immutable log of every transaction. Full visibility into agent spending.</p>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* CTA with Aurora */}
        <section className="relative min-h-[500px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 -z-10 opacity-50">
            <Aurora
              colorStops={["#1e40af", "#7c3aed", "#0891b2"]}
              blend={0.4}
              amplitude={0.8}
              speed={0.3}
            />
          </div>
          <div className="text-center px-6 py-20">
            <h2 className="text-3xl font-bold sm:text-5xl text-white">
              <DecryptedText
                text="Stop hoping your agent behaves."
                animateOn="view"
                speed={30}
                maxIterations={15}
                sequential={true}
                revealDirection="start"
                className="text-white"
                encryptedClassName="text-white/40"
              />
            </h2>
            <h2 className="text-3xl font-bold sm:text-5xl mt-4">
              <GradientText
                colors={["#60a5fa", "#a78bfa", "#f472b6"]}
                animationSpeed={5}
                className="text-3xl font-bold sm:text-5xl"
              >
                Start enforcing it.
              </GradientText>
            </h2>
            <div className="mt-10">
              <StarBorder
                as="a"
                className="inline-flex flex-row items-center justify-center gap-2 text-lg font-semibold px-8 py-3 cursor-pointer"
                color="#a78bfa"
                speed="5s"
              >
                Get Started
                <Zap className="h-5 w-5" />
              </StarBorder>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

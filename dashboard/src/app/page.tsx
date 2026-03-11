import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Shield,
  Zap,
  Eye,
  KeyRound,
  FileText,
  Ban,
  ArrowRight,
  Github,
  Lock,
  Code2,
  ExternalLink,
} from "lucide-react"

function TrustBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="group relative rounded-xl border bg-card p-6 transition-all hover:shadow-md hover:border-foreground/20">
      <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
        {step}
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">{description}</p>
    </div>
  )
}

function IntegrationBadge({ name, href }: { name: string; href: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
    >
      {name}
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  )
}

const CODE_EXAMPLE = `import { X402GuardClient } from "@x402guard/core"

const guard = new X402GuardClient({
  proxyUrl: "https://your-proxy.x402guard.com",
  agentId: "your-agent-uuid",
})

// Set spend limits before your agent goes live
await guard.createRule({
  agent_id: agent.id,
  rule_type: "MaxSpendPerTx",
  value: "5.00",         // max $5 USDC per transaction
})

// Every payment is validated against your rules
const result = await guard.proxyPayment({
  targetUrl: "https://api.service.com/paid-endpoint",
  x402Payment: signedPaymentHeader,
})`

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col font-[family-name:var(--font-geist-sans)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <span className="font-bold">x402Guard</span>
            <Badge variant="secondary" className="text-[10px]">BETA</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="https://github.com/x402guard/x402Guard" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-1.5" />
                GitHub
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">Launch Dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32 text-center">
            <Badge variant="outline" className="mb-6">
              Open Source &middot; Non-Custodial &middot; Base + Solana
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Guardrails for
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                Autonomous DeFi Agents
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed sm:text-xl">
              x402Guard is a non-custodial safety proxy that enforces spend limits,
              contract whitelists, and session keys on every x402 payment your AI agent makes.
              Your keys. Your rules. Your funds stay safe.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" asChild className="gap-2">
                <Link href="/login">
                  Launch Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="gap-2">
                <Link href="https://github.com/x402guard/x402Guard" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                  View Source
                </Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
              <TrustBadge icon={Lock} label="Non-Custodial" />
              <TrustBadge icon={Eye} label="Fully Audited" />
              <TrustBadge icon={Code2} label="Open Source" />
              <TrustBadge icon={Shield} label="6 Critical Fixes Shipped" />
            </div>
          </div>
        </section>

        {/* Problem Statement */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              AI agents can spend money. Who watches them?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground leading-relaxed">
              The x402 payment protocol lets agents pay for APIs autonomously.
              But without guardrails, a single bug or exploit can drain your wallet.
              x402Guard sits between your agent and the blockchain, enforcing your
              rules on every transaction — without ever touching your private keys.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="text-center mb-14">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Everything you need to ship safely
            </h2>
            <p className="mt-3 text-muted-foreground">
              Six layers of protection between your agent and irreversible transactions.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Shield}
              title="Spend Limits"
              description="Set per-transaction and daily spend caps in USDC. Atomic enforcement prevents race conditions (TOCTOU-safe)."
            />
            <FeatureCard
              icon={FileText}
              title="Contract Whitelists"
              description="Restrict which smart contracts your agent can interact with. Block unauthorized destinations before funds leave."
            />
            <FeatureCard
              icon={KeyRound}
              title="EIP-7702 Session Keys"
              description="Grant time-limited, scoped signing authority. Revoke instantly from the dashboard or API."
            />
            <FeatureCard
              icon={Eye}
              title="Immutable Audit Log"
              description="Every payment attempt is logged with full context. No UPDATE or DELETE — enforced at the database level."
            />
            <FeatureCard
              icon={Ban}
              title="Emergency Revoke"
              description="One-click revocation of all session keys and active rules. Fail-closed by default — deny first, ask later."
            />
            <FeatureCard
              icon={Zap}
              title="Multi-Chain"
              description="Base (EVM) via EIP-3009 TransferWithAuthorization, plus Solana via Anchor program. One proxy, two ecosystems."
            />
          </div>
        </section>

        {/* How It Works */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <div className="text-center mb-14">
              <h2 className="text-2xl font-bold sm:text-3xl">
                Three steps to protected agents
              </h2>
            </div>

            <div className="grid gap-12 sm:grid-cols-3">
              <StepCard
                step="1"
                title="Register Your Agent"
                description="Create an agent identity and configure guardrail rules via the dashboard or REST API."
              />
              <StepCard
                step="2"
                title="Route Payments Through Proxy"
                description="Point your agent's x402 payments at the proxy URL. One line of config — no contract changes needed."
              />
              <StepCard
                step="3"
                title="Monitor & Adjust"
                description="Watch spend in real-time, review audit logs, and update rules without redeploying your agent."
              />
            </div>
          </div>
        </section>

        {/* Code Example */}
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">
                Integrate in 5 minutes
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Install the SDK, set your proxy URL, define rules. Every payment your
                agent makes is validated against your guardrails before it hits the chain.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Badge variant="secondary">TypeScript</Badge>
                <Badge variant="secondary">Python</Badge>
                <Badge variant="secondary">REST API</Badge>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border bg-[#0d1117] p-5">
              <pre className="overflow-x-auto text-[13px] leading-relaxed text-gray-300">
                <code>{CODE_EXAMPLE}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl mb-3">
              Works with your agent framework
            </h2>
            <p className="text-muted-foreground mb-8">
              Ready-made adapters for the most popular autonomous agent platforms.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <IntegrationBadge name="ElizaOS" href="https://elizaos.ai" />
              <IntegrationBadge name="Virtuals Protocol" href="https://virtuals.io" />
              <IntegrationBadge name="Cod3x" href="https://cod3x.org" />
              <IntegrationBadge name="Custom SDK" href="https://github.com/x402guard/x402Guard/tree/main/examples/core" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Stop hoping your agent behaves.
            <br />
            <span className="text-muted-foreground">Start enforcing it.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Free and open source. Deploy your own proxy, or use our hosted beta.
            Your keys never leave your wallet.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild className="gap-2">
              <Link href="/login">
                Launch Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="gap-2">
              <Link href="https://github.com/x402guard/x402Guard" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4" />
                Star on GitHub
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>x402Guard &middot; Open Source &middot; MIT License</span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="https://github.com/x402guard/x402Guard" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              GitHub
            </Link>
            <Link href="https://github.com/x402guard/x402Guard/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Security
            </Link>
            <Link href="https://github.com/x402guard/x402Guard/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Contributing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

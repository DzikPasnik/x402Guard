"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Shield,
  Github,
  BookOpen,
  Rocket,
  Code2,
  Key,
  FileCheck,
  Activity,
  Server,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import GradientText from "@/components/GradientText"
import ScrollFloat from "@/components/ScrollFloat"
import SpotlightCard from "@/components/SpotlightCard"
import StarBorder from "@/components/StarBorder"

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="absolute top-3 right-3 p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-white/50" />
      )}
    </button>
  )
}

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <CopyButton text={code} />
      <pre className="rounded-lg bg-white/5 border border-white/10 p-4 pr-12 text-sm text-white/70 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  )
}

const navSections = [
  { id: "quick-start", label: "Quick Start", icon: Rocket },
  { id: "api-reference", label: "API Reference", icon: Code2 },
  { id: "guardrails", label: "Guardrail Rules", icon: Shield },
  { id: "session-keys", label: "Session Keys", icon: Key },
  { id: "integrations", label: "Integrations", icon: FileCheck },
  { id: "solana", label: "Solana Vault", icon: Activity },
  { id: "self-hosting", label: "Self-Hosting", icon: Server },
]

const apiEndpoints = [
  { method: "GET", path: "/api/v1/health", description: "Service health check (status, version, Redis)" },
  { method: "POST", path: "/api/v1/proxy", description: "Forward EVM x402 payment with guardrail enforcement" },
  { method: "POST", path: "/api/v1/proxy/solana", description: "Forward Solana x402 payment with vault validation" },
  { method: "POST", path: "/api/v1/agents", description: "Register a new agent" },
  { method: "GET", path: "/api/v1/agents/{id}", description: "Get agent details and spend summary" },
  { method: "POST", path: "/api/v1/agents/{id}/rules", description: "Create a guardrail rule" },
  { method: "GET", path: "/api/v1/agents/{id}/rules", description: "List active rules for an agent" },
  { method: "PUT", path: "/api/v1/agents/{id}/rules/{rule_id}", description: "Update a rule" },
  { method: "DELETE", path: "/api/v1/agents/{id}/rules/{rule_id}", description: "Deactivate a rule" },
  { method: "POST", path: "/api/v1/agents/{id}/session-keys", description: "Create a time-limited session key" },
  { method: "GET", path: "/api/v1/agents/{id}/session-keys", description: "List active session keys" },
  { method: "DELETE", path: "/api/v1/agents/{id}/session-keys/{key_id}", description: "Revoke a session key" },
  { method: "POST", path: "/api/v1/agents/{id}/revoke-all", description: "Emergency: revoke all keys + deactivate agent" },
  { method: "GET", path: "/api/v1/solana/vault/{owner}", description: "Query vault state (limits, balance, whitelist)" },
]

const ruleTypes = [
  {
    name: "MaxSpendPerTx",
    description: "Maximum USDC an agent can spend in a single x402 payment.",
    example: `{ "ruleType": { "MaxSpendPerTx": { "max_amount": 10000000 } } }`,
    note: "10 USDC (6 decimals)",
  },
  {
    name: "MaxSpendPerDay",
    description: "Maximum total USDC across all transactions in a 24-hour window.",
    example: `{ "ruleType": { "MaxSpendPerDay": { "max_amount": 100000000 } } }`,
    note: "100 USDC/day",
  },
  {
    name: "AllowedContracts",
    description: "Whitelist of contract addresses the agent is allowed to pay.",
    example: `{ "ruleType": { "AllowedContracts": { "addresses": ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"] } } }`,
    note: "Base USDC contract",
  },
  {
    name: "MaxLeverage",
    description: "Limits DeFi leverage exposure for the agent.",
    example: `{ "ruleType": { "MaxLeverage": { "max_leverage": 3 } } }`,
    note: "Max 3x leverage",
  },
  {
    name: "MaxSlippage",
    description: "Maximum acceptable slippage tolerance for trades.",
    example: `{ "ruleType": { "MaxSlippage": { "max_slippage_bps": 100 } } }`,
    note: "1% (100 basis points)",
  },
]

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-500/20 text-green-400 border-green-500/30",
    POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    PUT: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
  }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-bold border ${colors[method] ?? ""}`}>
      {method}
    </span>
  )
}

export function DocsContent() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-white font-[family-name:var(--font-geist-sans)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#09090b]/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
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

      <div className="mx-auto w-full max-w-6xl flex flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0 border-r border-white/10 py-8 pr-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen className="h-4 w-4 text-white/50" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Documentation</span>
          </div>
          <nav className="space-y-1">
            {navSections.map((section) => {
              const Icon = section.icon
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {section.label}
                </a>
              )
            })}
          </nav>

          <div className="mt-8 pt-6 border-t border-white/10 space-y-1">
            <Link
              href="/faq"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              FAQ
              <ChevronRight className="h-3 w-3 ml-auto" />
            </Link>
            <Link
              href="https://github.com/DzikPasnik/x402Guard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              GitHub
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 py-12 px-6 lg:pl-12 max-w-3xl">
          <div className="text-sm text-white/40 mb-4">
            <Link href="/" className="hover:text-white/70">x402Guard</Link>
            <span className="mx-2">/</span>
            <span>Documentation</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight mb-3">
            <GradientText
              colors={["#3b82f6", "#8b5cf6", "#06b6d4", "#3b82f6"]}
              animationSpeed={7}
              className="text-4xl font-bold tracking-tight"
            >
              Documentation
            </GradientText>
          </h1>
          <p className="text-lg text-white/60 mb-12">
            API reference, integration guides, and configuration docs for x402Guard.
          </p>

          {/* Quick Start */}
          <section id="quick-start" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Quick Start
            </ScrollFloat>

            <h3 className="font-semibold mb-3 text-white/90">Option A: Docker Compose (recommended)</h3>
            <CodeBlock code={`git clone https://github.com/DzikPasnik/x402Guard.git
cd x402Guard
docker compose up

# Verify
curl http://localhost:3402/api/v1/health`} />

            <h3 className="font-semibold mt-8 mb-3 text-white/90">Option B: TypeScript SDK</h3>
            <CodeBlock lang="typescript" code={`import { X402GuardClient } from "@x402guard/core";

const client = new X402GuardClient({
  proxyUrl: "http://localhost:3402",
  apiKey: "dev-api-key-change-me",
});

// Register agent
const agent = await client.registerAgent("my-bot", "0xOwnerAddress");

// Add guardrail: max $10 per transaction
await client.addRule(agent.id, {
  MaxSpendPerTx: { max_amount: 10_000_000 }, // 10 USDC (6 decimals)
});`} />

            <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white/70">
              <strong className="text-blue-400">Note:</strong> Management API endpoints require an{" "}
              <code className="bg-white/10 px-1 rounded text-xs">X-Api-Key</code> header.
              Set <code className="bg-white/10 px-1 rounded text-xs">MANAGEMENT_API_KEY</code> in your environment.
              If not set, the proxy denies all management requests (fail-closed).
            </div>
          </section>

          {/* API Reference */}
          <section id="api-reference" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              API Reference
            </ScrollFloat>
            <p className="text-white/60 mb-6">All endpoints are under <code className="bg-white/10 px-1.5 rounded text-xs">/api/v1</code>. Base URL for production: <code className="bg-white/10 px-1.5 rounded text-xs">https://x402guard-production.up.railway.app</code></p>

            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wide">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wide">Path</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/50 uppercase tracking-wide hidden sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {apiEndpoints.map((ep, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5"><MethodBadge method={ep.method} /></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-white/70">{ep.path}</td>
                      <td className="px-4 py-2.5 text-white/50 hidden sm:table-cell">{ep.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Guardrail Rules */}
          <section id="guardrails" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Guardrail Rules
            </ScrollFloat>
            <p className="text-white/60 mb-6">
              Create guardrail rules via <code className="bg-white/10 px-1.5 rounded text-xs">POST /api/v1/agents/{"{id}"}/rules</code>.
              Each rule is evaluated on every payment request. If any rule is violated, the payment is rejected.
            </p>

            <div className="space-y-4">
              {ruleTypes.map((rule) => (
                <SpotlightCard key={rule.name} className="p-5" spotlightColor="rgba(139,92,246,0.12)">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold font-mono text-sm">{rule.name}</h3>
                    <span className="text-xs text-white/40">{rule.note}</span>
                  </div>
                  <p className="text-sm text-white/60 mb-3">{rule.description}</p>
                  <pre className="rounded bg-white/5 border border-white/10 p-3 text-xs text-white/60 overflow-x-auto">
                    <code>{rule.example}</code>
                  </pre>
                </SpotlightCard>
              ))}
            </div>
          </section>

          {/* Session Keys */}
          <section id="session-keys" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Session Keys (EIP-7702)
            </ScrollFloat>
            <p className="text-white/60 mb-6">
              Session keys give your agent limited signing authority that auto-expires. Create them via the dashboard or API.
            </p>

            <h3 className="font-semibold mb-3 text-white/90">Create a session key</h3>
            <CodeBlock lang="bash" code={`curl -X POST -H "X-Api-Key: $API_KEY" -H "Content-Type: application/json" \\
  http://localhost:3402/api/v1/agents/AGENT_ID/session-keys \\
  -d '{
    "ownerAddress": "0xYourWallet",
    "chainId": 84532,
    "expiresAt": "2026-04-01T00:00:00Z",
    "maxSpend": 50000000
  }'`} />

            <h3 className="font-semibold mt-8 mb-3 text-white/90">Emergency revocation</h3>
            <CodeBlock lang="bash" code={`# Revoke ALL session keys and deactivate agent immediately
curl -X POST -H "X-Api-Key: $API_KEY" -H "Content-Type: application/json" \\
  http://localhost:3402/api/v1/agents/AGENT_ID/revoke-all \\
  -d '{ "ownerAddress": "0xYourWallet", "chainId": 84532 }'`} />

            <div className="mt-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-white/70">
              <strong className="text-yellow-400">Security:</strong> Revoke-all is an emergency operation. It immediately invalidates
              all active session keys and marks the agent as inactive. Re-activate via the dashboard.
            </div>
          </section>

          {/* Integrations */}
          <section id="integrations" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Integrations
            </ScrollFloat>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  name: "ElizaOS",
                  lang: "TypeScript",
                  install: "npm install @x402guard/elizaos-plugin",
                  link: "/use-cases/elizaos-agent-security",
                  github: "https://github.com/DzikPasnik/x402Guard/tree/main/examples/elizaos",
                },
                {
                  name: "Virtuals Protocol",
                  lang: "Python",
                  install: "pip install x402guard-game-plugin",
                  link: null,
                  github: "https://github.com/DzikPasnik/x402Guard/tree/main/examples/virtuals",
                },
                {
                  name: "Cod3x",
                  lang: "TypeScript",
                  install: "npm install @x402guard/cod3x-adapter",
                  link: null,
                  github: "https://github.com/DzikPasnik/x402Guard/tree/main/examples/cod3x",
                },
                {
                  name: "@x402guard/core",
                  lang: "TypeScript",
                  install: "npm install @x402guard/core",
                  link: null,
                  github: "https://github.com/DzikPasnik/x402Guard/tree/main/examples/core",
                },
              ].map((integration) => (
                <SpotlightCard key={integration.name} className="p-5" spotlightColor="rgba(59,130,246,0.12)">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{integration.name}</h3>
                    <span className="text-xs text-white/40">{integration.lang}</span>
                  </div>
                  <code className="block text-xs text-white/50 bg-white/5 rounded px-2 py-1.5 mb-3 overflow-x-auto">
                    {integration.install}
                  </code>
                  <div className="flex gap-3">
                    {integration.link && (
                      <Link href={integration.link} className="text-xs text-blue-400 hover:underline">
                        Guide →
                      </Link>
                    )}
                    <Link
                      href={integration.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1"
                    >
                      <Github className="h-3 w-3" />
                      Source
                    </Link>
                  </div>
                </SpotlightCard>
              ))}
            </div>
          </section>

          {/* Solana */}
          <section id="solana" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Solana Vault
            </ScrollFloat>
            <p className="text-white/60 mb-6">
              The Solana guard is an Anchor program that creates a PDA vault with on-chain guardrails:
              per-transaction limits, daily caps, and a program whitelist.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 mb-6">
              {[
                { title: "PDA vault", text: "Per-owner vault with configurable limits and whitelisted programs" },
                { title: "Reserve-then-forward", text: "spent_today updated atomically before CPI transfer" },
                { title: "Program whitelist", text: "Only approved programs can receive funds from the vault" },
                { title: "Checked arithmetic", text: "checked_add/checked_sub everywhere, zero `as` casts" },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-white/10 p-4">
                  <p className="font-semibold text-sm mb-1">{item.title}</p>
                  <p className="text-xs text-white/50">{item.text}</p>
                </div>
              ))}
            </div>

            <CodeBlock lang="bash" code={`# Build the Solana program
cd solana && anchor build

# Run integration tests
anchor test`} />
          </section>

          {/* Self-Hosting */}
          <section id="self-hosting" className="mb-16 scroll-mt-20">
            <ScrollFloat
              containerClassName="mb-6"
              textClassName="text-2xl font-bold text-white"
              animationDuration={1}
              stagger={0.03}
            >
              Self-Hosting
            </ScrollFloat>
            <p className="text-white/60 mb-6">
              x402Guard is fully self-hostable. You need PostgreSQL, Redis, and the Rust proxy binary.
            </p>

            <h3 className="font-semibold mb-3 text-white/90">Environment variables</h3>
            <div className="rounded-lg border border-white/10 overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-white/50">Variable</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-white/50">Required</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-white/50 hidden sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {[
                    { name: "DATABASE_URL", req: "Yes", desc: "PostgreSQL connection string" },
                    { name: "UPSTASH_REDIS_URL", req: "Yes", desc: "Redis connection URL" },
                    { name: "MANAGEMENT_API_KEY", req: "Prod", desc: "API key for management endpoints (fail-closed)" },
                    { name: "PROXY_PORT", req: "No", desc: "Listen port (default: 3402)" },
                    { name: "BASE_SEPOLIA_RPC_URL", req: "No", desc: "Base Sepolia JSON-RPC" },
                    { name: "BASE_MAINNET_RPC_URL", req: "No", desc: "Base Mainnet JSON-RPC" },
                    { name: "RUST_LOG", req: "No", desc: "Log level (default: info)" },
                  ].map((v) => (
                    <tr key={v.name} className="border-b border-white/5">
                      <td className="px-4 py-2 font-mono text-white/70">{v.name}</td>
                      <td className="px-4 py-2 text-white/50">{v.req}</td>
                      <td className="px-4 py-2 text-white/40 hidden sm:table-cell">{v.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold mb-3 text-white/90">Docker production build</h3>
            <CodeBlock code={`docker build -t x402guard-proxy -f proxy/Dockerfile .
docker run -p 3402:3402 \\
  -e DATABASE_URL="postgresql://..." \\
  -e UPSTASH_REDIS_URL="redis://..." \\
  -e MANAGEMENT_API_KEY="your-secure-key" \\
  x402guard-proxy`} />
          </section>

          {/* CTA */}
          <div className="mt-8 mb-12">
            <SpotlightCard className="p-8 text-center" spotlightColor="rgba(139,92,246,0.15)">
              <h2 className="text-xl font-bold mb-3">Ready to secure your AI agent?</h2>
              <p className="text-white/60 mb-6 text-sm">Set up guardrail rules in minutes. Free and open-source.</p>
              <div className="flex flex-wrap gap-4 justify-center">
                <StarBorder as="div" className="cursor-pointer" color="#8b5cf6" speed="5s">
                  <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-0.5">
                    Launch Dashboard
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </StarBorder>
                <Link
                  href="https://github.com/DzikPasnik/x402Guard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  <Github className="h-4 w-4" />
                  View on GitHub
                </Link>
              </div>
            </SpotlightCard>
          </div>
        </main>
      </div>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} x402Guard. Open source under MIT License.</p>
      </footer>
    </div>
  )
}

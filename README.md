<div align="center">

# x402Guard

### Non-custodial safety proxy for autonomous AI agents making real crypto payments

[![CI](https://github.com/DzikPasnik/x402Guard/actions/workflows/ci.yml/badge.svg)](https://github.com/DzikPasnik/x402Guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Proxy Status](https://img.shields.io/badge/proxy-live-brightgreen)](https://x402guard-production.up.railway.app/api/v1/health)
[![Tests](https://img.shields.io/badge/tests-106%20proxy%20%2B%2013%20solana-blue)](https://github.com/DzikPasnik/x402Guard/actions)
[![Security Audit](https://img.shields.io/badge/security%20audit-6%20critical%20fixed-brightgreen)](SECURITY.md)

[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](#tech-stack)
[![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white)](#solana-guard)
[![Next.js](https://img.shields.io/badge/Next.js%2016-000000?logo=nextdotjs&logoColor=white)](#dashboard)
[![Base](https://img.shields.io/badge/Base-0052FF?logo=coinbase&logoColor=white)](#evm-base)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](#integrations)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](#integrations)

**[x402guard.dev](https://x402guard.dev)** ·
**[Agent Demo](https://x402guard.dev/agent)** ·
**[API Health](https://x402guard-production.up.railway.app/api/v1/health)** ·
**[Docs](https://x402guard.dev/docs)** ·
**[FAQ](https://x402guard.dev/faq)** ·
**[Security Policy](SECURITY.md)** ·
**[Contributing](CONTRIBUTING.md)**

</div>

---

## The Problem

AI agents are getting wallets. Coinbase's [x402 protocol](https://www.x402.org/) enables agents to pay for web services with real crypto using HTTP 402. But without guardrails, an autonomous agent can:

| Risk | Impact |
|------|--------|
| **Drain a wallet** | No per-transaction or daily spend limits |
| **Interact with malicious contracts** | No whitelist enforcement |
| **Overspend in loops** | No circuit breaker for runaway agents |
| **Leave no trace** | No audit trail for compliance or debugging |
| **Replay payments** | Nonce reuse enables double-spend |

## The Solution

**x402Guard** is a non-custodial proxy that sits between your AI agent and Web3 services. It intercepts x402 payment flows, enforces configurable guardrail rules, and maintains an immutable audit log — all **without ever touching private keys or holding funds**.

```
                            x402Guard Proxy (Rust/Axum)
                         ┌─────────────────────────────────┐
                         │                                 │
┌──────────┐   x402     │  ┌───────────┐  ┌────────────┐  │     ┌─────────────┐
│ AI Agent │───────────►│  │ Guardrails │  │   Spend    │  │────►│   Target    │
│ (Eliza,  │◄───────────│  │  Engine    │  │  Tracker   │  │◄────│  Service    │
│ Virtuals,│   response │  └─────┬─────┘  └──────┬─────┘  │     │ (402 wall)  │
│ Cod3x)   │            │        │               │         │     └─────────────┘
└──────────┘            │  ┌─────▼─────┐  ┌──────▼─────┐  │
                         │  │  Session  │  │   Audit    │  │
                         │  │   Keys    │  │    Log     │  │
                         │  │ (EIP-7702)│  │(immutable) │  │
                         │  └───────────┘  └────────────┘  │
                         └──────────┬──────────┬───────────┘
                                    │          │
                              ┌─────▼──┐ ┌─────▼──────┐
                              │ Redis  │ │ PostgreSQL  │
                              │ nonces │ │ guardrails  │
                              │ rates  │ │ keys, audit │
                              └────────┘ └────────────┘
```

### How It Works

1. **Agent sends request** through x402Guard proxy instead of directly to the service
2. **Proxy intercepts** the x402 payment header (EIP-3009 `TransferWithAuthorization`)
3. **Guardrails evaluate** — spend limits, contract whitelist, session key validity
4. **Spend is recorded atomically** (TOCTOU-safe) before forwarding
5. **Request forwards** to the target service only if all rules pass
6. **Audit event logged** — every action is immutably recorded

> **Non-custodial**: x402Guard never holds private keys or funds. It only validates signatures and enforces rules.

---

## Key Features

### Guardrail Rules

| Rule | What It Does | Example |
|------|-------------|---------|
| `MaxSpendPerTx` | Caps individual payment amount | Max $10 per transaction |
| `MaxSpendPerDay` | Caps cumulative daily spending | Max $100/day across all txns |
| `AllowedContracts` | Whitelists target contract addresses | Only USDC on Base allowed |
| `MaxLeverage` | Limits DeFi leverage exposure | Max 3x leverage |
| `MaxSlippage` | Caps acceptable slippage | Max 1% slippage tolerance |

### EVM (Base)

- **EIP-3009** signature verification for x402 `exact` payment scheme
- **EIP-7702 session keys** — time-limited, scoped spending keys with per-key limits
- **Atomic spend tracking** — INSERT...SELECT WHERE prevents TOCTOU race conditions
- **Nonce deduplication** — Redis SET NX prevents replay attacks
- **SSRF prevention** — HTTPS-only, no private IPs, no credentials in URLs

### Solana Guard

- **PDA vault** — Anchor program with per-transaction and daily spend limits
- **Program whitelist** — only approved programs can receive funds
- **Reserve-then-forward** — `spent_today` updated atomically before CPI transfer
- **Owner-only recovery** — vault can always be closed by the owner, whitelist doesn't apply
- **Checked arithmetic everywhere** — `checked_add`/`checked_sub`, zero `as` casts

### Audit & Compliance

- **Immutable audit log** — append-only (no UPDATE/DELETE functions exist)
- **Database trigger defense** — `BEFORE UPDATE/DELETE` trigger rejects tampering
- **14 event types** — covers every agent action, from creation to revocation
- **Filterable** — by agent, event type, date range, session key

### Dashboard

- **Real-time monitoring** — agent spend vs. daily limits with progress bars
- **Guardrail CRUD** — create, update, delete rules per agent
- **Session key management** — create, inspect, revoke individual or all keys
- **Audit log viewer** — searchable, filterable event history
- **SIWE authentication** — Sign In with Ethereum via RainbowKit + Supabase
- **[Agent Demo](https://x402guard.dev/agent)** — AI chat with 7 live tools (Claude-powered)

---

## Try It

> **No setup required** — everything is deployed and running on Base Sepolia testnet.

| What | Link | Description |
|------|------|-------------|
| **Agent Demo** | [x402guard.dev/agent](https://x402guard.dev/agent) | Chat with an AI agent that queries guardrails, simulates payments, and reads audit logs in real time |
| **Dashboard** | [x402guard.dev](https://x402guard.dev) | Connect wallet, monitor agents, configure rules, view spend analytics |
| **Documentation** | [x402guard.dev/docs](https://x402guard.dev/docs) | API reference, integration guides, and configuration docs |
| **Health Check** | [API /health](https://x402guard-production.up.railway.app/api/v1/health) | Proxy status endpoint — returns JSON with service version and Redis status |
| **ElizaOS Security** | [/use-cases/elizaos-agent-security](https://x402guard.dev/use-cases/elizaos-agent-security) | Non-custodial guardrails for ElizaOS agents |
| **DeFi Spend Limits** | [/use-cases/defi-spend-limits](https://x402guard.dev/use-cases/defi-spend-limits) | Per-transaction and daily spend caps for AI DeFi agents |
| **Contract Whitelist** | [/use-cases/contract-whitelist](https://x402guard.dev/use-cases/contract-whitelist) | Whitelist approved contract addresses to block rogue payments |
| **FAQ** | [x402guard.dev/faq](https://x402guard.dev/faq) | Answers to common questions about x402Guard and the x402 protocol |

---

## Quick Start

### Option A: Docker Compose (recommended)

```bash
git clone https://github.com/DzikPasnik/x402Guard.git
cd x402Guard

# Start proxy + Postgres (with schema + seed data) + Redis
docker compose up

# Verify proxy is running
curl http://localhost:3402/api/v1/health
# {"status":"ok","version":"0.1.0","service":"x402guard-proxy","redis":"connected"}
```

The database schema and a demo agent are created automatically on first start.

### Option B: Interact with the API

```bash
# Management API key for local dev: dev-api-key-change-me
API_KEY="dev-api-key-change-me"

# List agents
curl -H "X-Api-Key: $API_KEY" http://localhost:3402/api/v1/agents

# Create a new agent
curl -X POST -H "X-Api-Key: $API_KEY" -H "Content-Type: application/json" \
  http://localhost:3402/api/v1/agents \
  -d '{"name": "my-trading-bot", "ownerAddress": "0xYourAddress"}'

# Add a $50/day spend limit (replace AGENT_ID)
curl -X POST -H "X-Api-Key: $API_KEY" -H "Content-Type: application/json" \
  http://localhost:3402/api/v1/agents/AGENT_ID/rules \
  -d '{"ruleType": {"MaxSpendPerDay": {"max_amount": 50000000}}}'

# Add contract whitelist (Base USDC only)
curl -X POST -H "X-Api-Key: $API_KEY" -H "Content-Type: application/json" \
  http://localhost:3402/api/v1/agents/AGENT_ID/rules \
  -d '{"ruleType": {"AllowedContracts": {"addresses": ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]}}}'
```

### Option C: Use the TypeScript SDK

```typescript
import { X402GuardClient } from "@x402guard/core";

const client = new X402GuardClient({
  proxyUrl: "http://localhost:3402",
  apiKey: "dev-api-key-change-me",
});

// Register agent
const agent = await client.registerAgent("my-bot", "0xOwnerAddress");

// Add guardrail: max $10 per transaction
await client.addRule(agent.id, {
  MaxSpendPerTx: { max_amount: 10_000_000 }, // 10 USDC (6 decimals)
});

// Proxy a payment — guardrails enforced automatically
const result = await client.proxyPayment({
  targetUrl: "https://api.example.com/premium",
  agentId: agent.id,
  x402Payment: paymentHeader,
  x402Requirements: requirementsHeader,
});
```

---

## API Reference

All endpoints are under `/api/v1`. Management endpoints require an `X-Api-Key` header.

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check (status, version, Redis) |
| `POST` | `/proxy` | Forward EVM x402 payment with guardrail enforcement |
| `POST` | `/proxy/solana` | Forward Solana x402 payment with vault validation |

### Agent Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agents` | Register a new agent |
| `GET` | `/agents/{id}` | Get agent details and spend summary |

### Guardrail Rules

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agents/{id}/rules` | Create a guardrail rule |
| `GET` | `/agents/{id}/rules` | List active rules for an agent |
| `PUT` | `/agents/{id}/rules/{rule_id}` | Update a rule |
| `DELETE` | `/agents/{id}/rules/{rule_id}` | Deactivate a rule |

### Session Keys (EIP-7702)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agents/{id}/session-keys` | Create a time-limited session key |
| `GET` | `/agents/{id}/session-keys` | List active session keys |
| `GET` | `/agents/{id}/session-keys/{key_id}` | Get session key details |
| `DELETE` | `/agents/{id}/session-keys/{key_id}` | Revoke a session key |
| `POST` | `/agents/{id}/revoke-all` | Emergency: revoke all keys + deactivate agent |

### Solana Vault

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/solana/vault/{owner_pubkey}` | Query vault state (limits, balance, whitelist) |

<details>
<summary><strong>Request/Response Examples</strong></summary>

#### POST /proxy — Proxy an EVM Payment

```json
// Request
{
  "targetUrl": "https://api.example.com/premium-data",
  "agentId": "uuid-of-agent",
  "sessionKeyId": "uuid-of-session-key",
  "x402Payment": "base64url-encoded-payment-payload",
  "x402Requirements": "base64url-encoded-payment-requirements"
}

// Success Response
{
  "success": true,
  "data": { /* proxied response from target service */ }
}

// Guardrail Violation Response (403)
{
  "success": false,
  "error": "Guardrail violation: MaxSpendPerDay exceeded (limit: 50000000, spent: 49500000, requested: 1000000)"
}
```

#### POST /agents/{id}/revoke-all — Emergency Revocation

```json
// Request
{
  "ownerAddress": "0xYourWalletAddress",
  "chainId": 8453
}

// Response
{
  "success": true,
  "keysRevoked": 3,
  "agentDeactivated": true,
  "onChainAuthorization": {
    "chainId": 8453,
    "address": "0x0000000000000000000000000000000000000000",
    "nonce": 42
  }
}
```

</details>

---

## Tech Stack

| Component | Technology | Details |
|-----------|-----------|---------|
| **Proxy** | Rust, Axum, SQLx, alloy-rs | High-performance async proxy with EIP-3009/EIP-7702 verification |
| **Solana Guard** | Anchor, SPL Token | On-chain PDA vault program with guardrails |
| **Dashboard** | Next.js 16, React 19, Tailwind 4, shadcn/ui v3 | Real-time monitoring with SIWE wallet auth |
| **Database** | PostgreSQL (Supabase) | RLS-enabled, immutable audit log with trigger defense |
| **Cache** | Redis (Upstash) | Nonce deduplication, sliding window rate limiter |
| **CI/CD** | GitHub Actions | Rust + Node + Solana + E2E + secret scanning |
| **Hosting** | Railway (proxy), Vercel (dashboard) | Production at x402guard.dev |

---

## Integrations

Ready-to-use plugins for popular AI agent frameworks:

| Framework | Language | What You Get | Code |
|-----------|----------|-------------|------|
| **@x402guard/core** | TypeScript | Full client SDK with typed errors, retry logic, Zod validation | [`examples/core`](examples/core/) |
| **ElizaOS** | TypeScript | Drop-in agent plugin for guarded payments | [`examples/elizaos`](examples/elizaos/) |
| **Virtuals Protocol** | Python | GAME SDK plugin with async support | [`examples/virtuals`](examples/virtuals/) |
| **Cod3x** | TypeScript | DeFi ToolChain adapter | [`examples/cod3x`](examples/cod3x/) |

Each integration includes its own README with setup instructions, usage examples, and tests.

---

## Project Structure

```
x402Guard/
├── proxy/                    # Rust proxy (Axum)
│   ├── src/
│   │   ├── handlers/         # API endpoint handlers
│   │   │   ├── health.rs     # GET /health
│   │   │   ├── proxy.rs      # POST /proxy (EVM + Solana)
│   │   │   ├── agents.rs     # Agent CRUD
│   │   │   ├── guardrail_rules.rs
│   │   │   ├── session_keys.rs
│   │   │   └── solana_vault.rs
│   │   ├── middleware/        # Request pipeline
│   │   │   ├── x402/         # x402 header parsing + verification
│   │   │   ├── guardrails.rs # Rule evaluation engine
│   │   │   ├── eip7702.rs    # Session key verification
│   │   │   ├── nonce.rs      # Replay prevention
│   │   │   ├── rate_limit.rs # Sliding window limiter
│   │   │   └── api_key.rs    # Management auth (fail-closed)
│   │   ├── models/           # Domain types
│   │   └── services/         # Business logic + repositories
│   ├── migrations/           # SQL migrations (sqlx)
│   └── Dockerfile            # Multi-stage production build
├── solana/                   # Anchor program
│   └── programs/x402-guard/  # On-chain PDA vault
├── dashboard/                # Next.js 16 dashboard
│   └── src/app/              # App Router pages
├── examples/                 # Framework integrations
│   ├── core/                 # TypeScript SDK
│   ├── elizaos/              # ElizaOS plugin
│   ├── virtuals/             # Virtuals Protocol (Python)
│   └── cod3x/                # Cod3x adapter
├── docker/                   # Docker init scripts
│   └── init.sql              # Schema + seed data
├── docker-compose.yml        # One-command local setup
├── .env.example              # All environment variables
├── SECURITY.md               # Security policy + audit results
└── CONTRIBUTING.md           # Development guide
```

---

## Security

> **Security paranoia level: 10.** This code handles real money.

### Audit Results

6 CRITICAL vulnerabilities were found and fixed before release:

| ID | Vulnerability | Fix |
|----|-------------|-----|
| CRITICAL-1 | TOCTOU race in daily spend tracking | Atomic `INSERT...SELECT WHERE` (no read-then-write) |
| CRITICAL-2 | Missing API key auth on management routes | Fail-closed middleware (denies if key not configured) |
| CRITICAL-3 | Dashboard IDOR (no ownership checks) | `assertAgentOwnership()` in all server actions |
| CRITICAL-4 | No Row Level Security on Supabase tables | RLS + FORCE enabled on all 5 tables |
| CRITICAL-5 | No USDC mint validation (Solana) | Hardcoded canonical mints for devnet + mainnet |
| CRITICAL-6 | Incomplete whitelist dual-authority check | Both authority AND address verified |

### Security Properties

- **Fail-closed** — errors and missing config deny by default
- **Constant-time comparison** — API keys compared with XOR (timing attack prevention)
- **Immutable audit log** — no UPDATE/DELETE functions + DB trigger blocks tampering
- **Checked arithmetic** — no `as i64`/`as u64` casts anywhere in financial code
- **Reserve-then-forward** — spend is recorded atomically before forwarding payments
- **SSRF prevention** — HTTPS-only, private IP blocking, CGNAT, IPv4-mapped IPv6
- **Rate limiting** — sliding window per-IP with Redis (atomic ZADD + ZCARD)
- **Nonce dedup** — Redis SET NX with TTL clamping (60s min, 86400s max)

**Found a vulnerability?** See [SECURITY.md](SECURITY.md) for our responsible disclosure policy.

---

## Development

### Prerequisites

- **Docker** (for Rust proxy builds and local Postgres/Redis)
- **Node.js 22+** (for dashboard and TypeScript examples)
- **Python 3.11+** (for Virtuals example only)
- **Anchor CLI** (for Solana program, optional)

### Commands

```bash
# === Proxy (Rust) ===
cargo check --workspace                    # Compile check
cargo test --workspace                     # Run all 106 tests
cargo clippy --workspace --all-targets -- -D warnings  # Lint

# === Dashboard (Next.js) ===
cd dashboard && npm install && npm run dev  # Dev server at :3000
cd dashboard && npm run build              # Production build

# === Solana (Anchor) ===
cd solana && anchor build                  # Build BPF program
cd solana && anchor test                   # Run 13 integration tests

# === Full stack (Docker) ===
docker compose up                          # Proxy + Postgres + Redis
```

<details>
<summary><strong>Environment Variables</strong></summary>

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PROXY_PORT` | No | Proxy listen port | `3402` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |
| `UPSTASH_REDIS_URL` | Yes | Redis connection URL | `redis://localhost:6379` |
| `MANAGEMENT_API_KEY` | **Prod** | API key for management endpoints (fail-closed) | — |
| `BASE_SEPOLIA_RPC_URL` | No | Base Sepolia JSON-RPC | `https://sepolia.base.org` |
| `BASE_MAINNET_RPC_URL` | No | Base Mainnet JSON-RPC | `https://mainnet.base.org` |
| `SOLANA_RPC_URL` | No | Solana JSON-RPC | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key | — |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect project ID | — |
| `RUST_LOG` | No | Log level (`warn` in production) | `info` |

</details>

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**Quick rules:**
- **TDD** — write tests first, then implement
- **Immutability** — create new objects, never mutate existing ones
- **Fail-closed** — errors deny by default, never silently pass
- **Small files** — 200-400 lines typical, 800 max
- **Checked arithmetic** — no `as` casts on financial values

---

## License

[MIT](LICENSE) — free for commercial and personal use.

---

<div align="center">

**Built for the x402 ecosystem** · Protecting AI agents from themselves since 2026

[Website](https://x402guard.dev) · [Agent Demo](https://x402guard.dev/agent) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

</div>

<div align="center">

# x402Guard

### The safety layer autonomous AI agents need before touching real money.

[![CI](https://github.com/DzikPasnik/x402Guard/actions/workflows/ci.yml/badge.svg)](https://github.com/DzikPasnik/x402Guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Proxy Status](https://img.shields.io/badge/proxy-live-brightgreen)](https://x402guard-production.up.railway.app/api/v1/health)
[![Tests](https://img.shields.io/badge/tests-106%20proxy%20%2B%2013%20solana-blue)](https://github.com/DzikPasnik/x402Guard/actions)
[![Security Audit](https://img.shields.io/badge/security%20audit-passed-brightgreen)](SECURITY.md)
[![Rust](https://img.shields.io/badge/rust-%23000000.svg?logo=rust&logoColor=white)](proxy/)
[![Solana](https://img.shields.io/badge/solana-%239945FF.svg?logo=solana&logoColor=white)](solana/)
[![Next.js](https://img.shields.io/badge/next.js-%23000000.svg?logo=nextdotjs&logoColor=white)](dashboard/)

[Live Dashboard](https://x402-guard-flame.vercel.app) ·
[Agent Demo](https://x402-guard-flame.vercel.app/agent) ·
[Proxy Health](https://x402guard-production.up.railway.app/api/v1/health) ·
[Security Policy](SECURITY.md) ·
[Contributing](CONTRIBUTING.md)

</div>

---

## Why x402Guard?

AI agents are getting wallets. Coinbase's [x402 protocol](https://www.x402.org/) lets agents pay for web services with real crypto. But without guardrails, an autonomous agent can:

- **Drain a wallet** — no per-transaction or daily spend cap
- **Interact with malicious contracts** — no whitelist enforcement
- **Overspend in loops** — no circuit breaker for runaway agents
- **Leave no trace** — no audit trail for compliance

**x402Guard** is a non-custodial proxy that sits between your agent and Web3 services. It intercepts x402 payment flows and enforces configurable rules — without ever touching private keys.

```
┌─────────┐     ┌──────────────────────────────────┐     ┌─────────────────┐
│ AI Agent │────▶│         x402Guard Proxy           │────▶│  Target Service  │
│          │◀────│        (Rust/Axum :3402)          │◀────│   (402 paywall)  │
└─────────┘     └──────────┬───────────┬────────────┘     └─────────────────┘
                           │           │
                    ┌──────▼──┐  ┌─────▼──────┐
                    │  Redis   │  │  Postgres   │
                    │ rate lim │  │ keys, audit │
                    │  nonces  │  │  guardrails │
                    └─────────┘  └─────────────┘
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Spend Limits** | `MaxSpendPerTx` and `MaxSpendPerDay` — cap individual and daily payments |
| **Contract Whitelist** | `AllowedContracts` — only approved addresses can receive funds |
| **Session Keys** | EIP-7702 time-limited, scoped spending keys on Base |
| **Solana Guard** | PDA vault with per-tx limits and program whitelist |
| **Replay Prevention** | Redis-backed nonce tracking prevents double-spend attacks |
| **Rate Limiting** | Sliding window per-IP and global rate limits |
| **Audit Log** | Immutable, append-only log of every action (no UPDATE/DELETE) |
| **x402 Verification** | EIP-3009 `TransferWithAuthorization` for the x402 `exact` scheme |

## Try It

> **No setup required** — everything is deployed and running on testnet.

| | |
|---|---|
| **[Agent Demo](https://x402-guard-flame.vercel.app/agent)** | Chat with an AI agent that uses x402Guard tools live — check guardrails, simulate payments, query audit logs |
| **[Dashboard](https://x402-guard-flame.vercel.app)** | Monitor agents, configure guardrail rules, view spend analytics |
| **[Proxy API](https://x402guard-production.up.railway.app/api/v1/health)** | Production proxy running on Base Sepolia |

## Quick Start

```bash
# Clone and configure
git clone https://github.com/DzikPasnik/x402Guard.git
cd x402Guard
cp .env.example .env    # Edit with your RPC URLs and Supabase credentials

# Start everything
docker compose up       # Proxy :3402 + Postgres :5432 + Redis :6379

# Verify
curl http://localhost:3402/api/v1/health
# → {"status":"ok"}

# Dashboard (separate terminal)
cd dashboard && npm install && npm run dev
# → http://localhost:3000
```

## Tech Stack

| Component | Technology | Tests |
|-----------|-----------|-------|
| **Proxy** | Rust, Axum, SQLx, alloy-rs | 106 tests |
| **Solana Guard** | Anchor, SPL Token | 13 tests |
| **Dashboard** | Next.js 16, TypeScript, Tailwind, shadcn/ui | E2E |
| **Database** | PostgreSQL (Supabase) + Redis (Upstash) | — |
| **CI** | GitHub Actions (Rust, Node, Solana, secrets scan) | — |

## Integrations

Ready-to-use plugins for popular AI agent frameworks:

| Framework | Type | Code |
|-----------|------|------|
| **Direct SDK** | TypeScript client | [`examples/core`](examples/core/) |
| **ElizaOS** | Agent plugin | [`examples/elizaos`](examples/elizaos/) |
| **Virtuals Protocol** | GAME SDK plugin | [`examples/virtuals`](examples/virtuals/) |
| **Cod3x** | DeFi adapter | [`examples/cod3x`](examples/cod3x/) |

## Development

```bash
# Rust proxy
cargo check --workspace          # Compile check
cargo test --workspace           # Run all tests
cargo clippy --workspace --all-targets -- -D warnings  # Lint

# Dashboard
cd dashboard && npm run build    # Production build
cd dashboard && npm run dev      # Dev server
```

<details>
<summary><strong>Environment Variables</strong></summary>

See [`.env.example`](.env.example) for the full list.

| Variable | Description | Default |
|----------|-------------|---------|
| `PROXY_PORT` | Proxy listen port | `3402` |
| `DATABASE_URL` | Postgres connection string | `postgresql://...` |
| `UPSTASH_REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `RATE_LIMIT_RPS` | Rate limit (requests/sec) | `1000` |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC | `https://sepolia.base.org` |

</details>

## Security

This project handles real money. Security is taken seriously.

- **6 CRITICAL vulnerabilities** found and fixed during audit ([details](SECURITY.md))
- Atomic spend tracking (TOCTOU prevention)
- Fail-closed on errors (deny by default)
- Constant-time API key comparison
- Immutable audit log with DB trigger defense
- Row Level Security on all Supabase tables

Report vulnerabilities: see [SECURITY.md](SECURITY.md)

## Project Status

All planned phases are complete and deployed to production:

| Phase | Description |
|-------|-------------|
| Core Proxy | x402 verification, rate limiting, replay prevention |
| Guardrails Engine | EIP-7702 session keys, spend limits, contract whitelist |
| Audit & Solana | Immutable audit logs, Solana PDA vault guard |
| Dashboard | Agent monitoring, guardrail CRUD, spend analytics |
| Integrations | ElizaOS, Virtuals, Cod3x plugins |
| Security Audit | Full audit — 6 CRITICAL fixed |
| Agent Demo | Interactive AI agent with live x402Guard tools |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- Coding standards (immutability, TDD, security-first)
- PR workflow and review process

## License

[MIT](LICENSE) — free for commercial and personal use.

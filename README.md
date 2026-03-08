# x402Guard

[![CI](https://github.com/DzikPasnik/x402Guard/actions/workflows/ci.yml/badge.svg)](https://github.com/DzikPasnik/x402Guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Proxy Status](https://img.shields.io/badge/proxy-live-brightgreen)](https://x402guard-production.up.railway.app/api/v1/health)

Non-custodial x402 safety proxy for autonomous DeFi agents on Base and Solana.

> **Live now:** [Dashboard](https://x402-guard-flame.vercel.app) | [Proxy Health](https://x402guard-production.up.railway.app/api/v1/health) | [Security Audit](SECURITY.md)

x402Guard sits between AI agents and Web3 services, intercepting HTTP 402 payment flows
and enforcing configurable guardrails (spend limits, contract whitelists, session key scoping)
without ever holding user funds.

## Architecture

```
Agent → x402Guard Proxy (Rust/Axum :3402) → Target Service
              ↕
        Redis (rate limiting, nonces)
        Postgres (session keys, audit logs)
        Base / Solana (on-chain verification)
```

## Features

- EIP-3009 `TransferWithAuthorization` verification (x402 `exact` scheme)
- EIP-7702 session keys with spend limits and expiry (Base)
- Solana PDA vault guard with per-tx limits and program whitelist
- Configurable guardrails: MaxSpendPerTx, MaxSpendPerDay, AllowedContracts
- Redis-backed sliding window rate limiting + replay attack prevention
- Next.js dashboard for agent monitoring and key management

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Rust (stable, via [rustup](https://rustup.rs))
- Node.js 20+ and npm

### 1. Clone and configure

```bash
git clone https://github.com/DzikPasnik/x402Guard.git
cd x402Guard
cp .env.example .env
# Edit .env with your RPC URLs and Supabase credentials
```

### 2. Start with Docker Compose

```bash
docker compose up
```

This starts:
- Rust proxy at http://localhost:3402
- Postgres at localhost:5432
- Redis at localhost:6379

### 3. Verify health

```bash
curl http://localhost:3402/api/v1/health
# → {"status":"ok"}
```

### 4. Dashboard (development)

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:3000
```

## Development

### Rust proxy

```bash
# Compile check
cargo check --workspace

# Run tests
cargo test --workspace

# Lint
cargo clippy --workspace --all-targets -- -D warnings

# Run locally (requires .env)
cargo run -p x402-guard-proxy
```

### Environment variables

See [.env.example](.env.example) for all required variables.

Key variables:
| Variable | Description | Default |
|----------|-------------|---------|
| `PROXY_PORT` | Proxy listen port | `3402` |
| `DATABASE_URL` | Postgres connection string | `postgresql://postgres:postgres@localhost:54322/postgres` |
| `UPSTASH_REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `RATE_LIMIT_RPS` | Global rate limit (requests/sec) | `1000` |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC | `https://sepolia.base.org` |

## Project Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 - Setup | Done | Repo skeleton, CI, Docker Compose |
| 1 - Core Proxy | Done | x402 verification, rate limiting, replay prevention (19 tests) |
| 2 - Guardrails + Session Keys | Done | EIP-7702, spend limits, contract whitelist (52 tests) |
| 3 - Revoke + Audit + Solana | Done | Solana PDA vault, immutable audit logs (102 proxy + 13 Solana tests) |
| 4 - Dashboard | Done | Agent monitoring, guardrail CRUD, audit log viewer, spend charts |
| 5 - Integrations | Done | ElizaOS plugin, Virtuals Game plugin, Cod3x adapter |
| Security Audit | Done | 6 CRITICAL vulnerabilities found and fixed (see [SECURITY.md](SECURITY.md)) |

## Integration Examples

| Example | Language | Framework | Description |
|---------|----------|-----------|-------------|
| [core](examples/core/) | TypeScript | Vanilla SDK | Direct proxy API client |
| [elizaos](examples/elizaos/) | TypeScript | ElizaOS | AI agent plugin |
| [virtuals](examples/virtuals/) | Python | GAME SDK | Virtuals Protocol integration |
| [cod3x](examples/cod3x/) | TypeScript | Cod3x | DeFi adapter |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR workflow.

## License

MIT

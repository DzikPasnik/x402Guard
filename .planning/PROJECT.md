# x402Guard.dev

## What This Is

A high-performance, non-custodial safety proxy for autonomous DeFi trading and yield agents. x402Guard sits between AI agents (ElizaOS, Virtuals Protocol, Cod3x) and blockchain networks, enforcing spend limits, contract whitelists, and session key scoping — so agents can pay for APIs/oracles/compute via the x402 protocol without risking user funds. Open-source (MIT), targeting Base and Solana.

## Core Value

Agents can operate autonomously with x402 payments while users maintain absolute control — hard spend limits, scoped permissions, and instant one-click revoke. Zero custody, zero trust in the agent.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Rust proxy skeleton with Axum + Tokio — existing
- ✓ Modular middleware architecture (x402, guardrails, eip7702, rate_limit) — existing
- ✓ Domain models (Agent, SessionKey, GuardrailRule) — existing
- ✓ Health check endpoint — existing
- ✓ Docker build setup — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Core x402 payment verification and forwarding
- [ ] Configurable guardrails (max spend per tx/day, allowed contracts, max leverage, max slippage)
- [ ] EIP-7702 session keys (scoped, time-limited, revocable) on Base
- [ ] PDA-based vault with guard program on Solana (SPL token, per-tx limits, contract whitelist)
- [ ] Instant revoke of all session keys for an agent (one-click)
- [ ] Audit log of all agent transactions (immutable)
- [ ] Dashboard: real-time spend monitoring, agent status, transaction logs
- [ ] Dashboard: full guardrail configuration UI (create/edit rules per agent)
- [ ] Dashboard: session key management (create, view, revoke)
- [ ] Dashboard: alert system when agents approach spend limits
- [ ] Rate limiting per agent / per session key
- [ ] Integration example: ElizaOS agent using x402Guard
- [ ] Integration example: Virtuals Protocol agent using x402Guard
- [ ] Integration example: Cod3x agent using x402Guard

### Out of Scope

- Mobile app — web dashboard sufficient for MVP
- Multi-sig approval flows — adds complexity, defer to v2
- Custom token support beyond USDC — USDC only for MVP simplicity
- Automated trading strategies — x402Guard is infrastructure, not a trading bot
- Fiat on/off ramp — out of scope, users bring their own USDC

## Context

- **x402 Protocol**: Emerging standard where services return HTTP 402 (Payment Required) and agents pay automatically in USDC. x402Guard intercepts these to enforce safety.
- **EIP-7702 (Base)**: Allows EOAs to delegate execution to smart contracts with scoped permissions. Used for session keys that give agents limited, revocable access.
- **Solana Model**: PDA-based vault — user deposits USDC into a program-controlled vault. Agent can only withdraw within rules enforced by the guard program. Stronger non-custodial guarantee for investor confidence.
- **Target Users**: Developers building autonomous agents (primary), retail/semi-pro traders with $5-100k capital, small funds and DAOs.
- **Competitive Landscape**: No established x402 safety proxy exists. First-mover advantage in a nascent but growing space.
- **Existing Code**: Rust proxy skeleton with Axum, modular middleware stubs, domain models, Dockerfile. No dashboard code yet.

## Constraints

- **Tech Stack**: Rust (Tokio + Axum) for proxy, Next.js 15 for dashboard, Supabase for DB/auth, Upstash Redis for cache — final, not negotiable
- **Timeline**: 8-week MVP
- **Chains**: Base (priority, Sepolia + mainnet) and Solana (devnet + mainnet)
- **Security**: Maximum from day 1 — zero custody, scoped permissions, immutable audit logs
- **License**: MIT open-source from first commit
- **Deployment**: Railway/Fly.io for Rust proxy, Vercel for dashboard

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for core proxy | Performance + memory safety for financial infrastructure | — Pending |
| EIP-7702 for Base session keys | Native delegation, scoped/revocable, emerging standard | — Pending |
| PDA vault for Solana | Stronger non-custodial guarantee, better investor optics than SPL approve | — Pending |
| USDC-only for MVP | Simplifies token handling, most common stablecoin in DeFi agent payments | — Pending |
| Supabase for DB + Auth | Managed Postgres + built-in auth + realtime subscriptions for dashboard | — Pending |
| Full config dashboard (not just monitoring) | Users need to create session keys, configure guardrails, manage agents — not just watch | — Pending |
| Both key flows (dashboard create + API request) | Dashboard for manual setup, API flow for automation — both needed | — Pending |

---
*Last updated: 2026-02-24 after initialization*

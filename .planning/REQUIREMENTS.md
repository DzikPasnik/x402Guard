# x402Guard Requirements

## Overview

Non-custodial x402 safety proxy for autonomous DeFi agents. Intercepts HTTP 402 payment flows, enforces guardrails, manages EIP-7702 session keys (Base) and PDA vaults (Solana), and provides a full-control dashboard.

## Functional Requirements

### FR-1: x402 Payment Proxy (Core)

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-1.1 | Parse `X-Payment-Requirements` header from upstream 402 responses | MUST | 1 |
| FR-1.2 | Verify EIP-3009 `TransferWithAuthorization` signatures (EIP-712 recovery) | MUST | 1 |
| FR-1.3 | Forward verified payment proof (`X-Payment` header) to target service | MUST | 1 |
| FR-1.4 | Track payment nonces in Redis to prevent replay attacks | MUST | 1 |
| FR-1.5 | Support `exact` payment scheme (EIP-3009 USDC) | MUST | 1 |
| FR-1.6 | Return structured proxy response with tx hash and status | MUST | 1 |

### FR-2: Guardrails Engine

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-2.1 | Enforce max spend per single transaction (USDC) | MUST | 2 |
| FR-2.2 | Enforce max spend per 24h rolling window per agent | MUST | 2 |
| FR-2.3 | Enforce contract address whitelist | MUST | 2 |
| FR-2.4 | Enforce max leverage limit | SHOULD | 2 |
| FR-2.5 | Enforce max slippage in basis points | SHOULD | 2 |
| FR-2.6 | Guardrail rules configurable per agent and per session key | MUST | 2 |
| FR-2.7 | Guardrail violations return 403 with violation details | MUST | 2 |

### FR-3: EIP-7702 Session Keys (Base)

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-3.1 | Create scoped session keys with spend limits + contract whitelist + expiry | MUST | 2 |
| FR-3.2 | Verify session key delegation on-chain via EIP-7702 Type 4 tx | MUST | 2 |
| FR-3.3 | Track session key usage (spent amount) in real-time | MUST | 2 |
| FR-3.4 | Revoke individual session keys | MUST | 3 |
| FR-3.5 | Revoke ALL session keys for an agent (one-click via zero-address delegation) | MUST | 3 |
| FR-3.6 | Deploy SessionKeyValidator Solidity contract on Base Sepolia | MUST | 2 |

### FR-4: Solana PDA Vault Guard

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-4.1 | Initialize PDA vault per user with configurable rules | MUST | 3 |
| FR-4.2 | Deposit USDC into PDA vault | MUST | 3 |
| FR-4.3 | Guarded withdrawal with per-tx limit, daily cap, program whitelist | MUST | 3 |
| FR-4.4 | Revoke agent access (zero out agent pubkey) | MUST | 3 |
| FR-4.5 | Update vault rules (owner-only) | SHOULD | 3 |
| FR-4.6 | Deploy guard program on Solana devnet | MUST | 3 |

### FR-5: Rate Limiting

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-5.1 | Per-agent sliding window rate limit (Redis-backed) | MUST | 1 |
| FR-5.2 | Per-session-key rate limit | SHOULD | 2 |
| FR-5.3 | Global proxy rate limit (DDoS protection) | MUST | 1 |
| FR-5.4 | Return 429 with `Retry-After` header | MUST | 1 |

### FR-6: Audit Logs

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-6.1 | Log every proxy request (agent, amount, target, timestamp, result) | MUST | 3 |
| FR-6.2 | Log all guardrail violations | MUST | 3 |
| FR-6.3 | Log session key creation, usage, and revocation events | MUST | 3 |
| FR-6.4 | Immutable append-only audit log in Supabase | MUST | 3 |
| FR-6.5 | Audit log queryable by agent, time range, event type | SHOULD | 4 |

### FR-7: Dashboard

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-7.1 | User authentication via Supabase Auth (wallet connect) | MUST | 4 |
| FR-7.2 | Real-time spend monitoring per agent | MUST | 4 |
| FR-7.3 | Transaction log viewer with filtering | MUST | 4 |
| FR-7.4 | Agent status overview (active/paused/revoked) | MUST | 4 |
| FR-7.5 | Create and manage guardrail rules per agent | MUST | 4 |
| FR-7.6 | Create, view, and revoke session keys | MUST | 4 |
| FR-7.7 | One-click revoke all keys for an agent | MUST | 4 |
| FR-7.8 | Alert indicators when agent approaches spend limits | SHOULD | 4 |
| FR-7.9 | Responsive layout (desktop-first, tablet-friendly) | SHOULD | 4 |

### FR-8: Integration Examples

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FR-8.1 | ElizaOS plugin example (`@elizaos/plugin-x402guard`) | MUST | 5 |
| FR-8.2 | Virtuals Protocol GAME plugin example | MUST | 5 |
| FR-8.3 | Cod3x adapter example | SHOULD | 5 |
| FR-8.4 | Each example includes README with setup instructions | MUST | 5 |

## Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-1 | Proxy request latency (p99) | < 200ms (excluding on-chain verification) |
| NFR-2 | Concurrent connections | 1,000+ |
| NFR-3 | Availability | 99.9% uptime |
| NFR-4 | Zero custody | Proxy never holds or controls user funds |
| NFR-5 | Test coverage | 80%+ on core proxy modules |
| NFR-6 | Build time | < 5 minutes (incremental < 30s) |
| NFR-7 | Docker image size | < 50MB (Rust binary) |
| NFR-8 | Security audit readiness | No known OWASP Top 10 vulnerabilities |

## Acceptance Criteria

### Phase 0: Repo Setup
- [ ] Cargo workspace compiles (`cargo check`)
- [ ] Next.js dashboard installs and runs (`npm run dev`)
- [ ] Docker compose brings up all services
- [ ] CI pipeline runs on push
- [ ] Health endpoint returns 200

### Phase 1: Core Proxy
- [ ] `/api/v1/proxy` accepts x402 payment requests
- [ ] EIP-3009 signatures verified correctly
- [ ] Invalid signatures rejected with 401
- [ ] Rate limiting enforced (429 on exceed)
- [ ] Nonce replay prevented
- [ ] 80%+ test coverage on middleware

### Phase 2: Guardrails + EIP-7702
- [ ] All guardrail rules enforced
- [ ] SessionKeyValidator deployed on Base Sepolia
- [ ] Session keys created, verified, and tracked
- [ ] Guardrail violations return 403 with details

### Phase 3: Revoke + Audit + Solana
- [ ] One-click revoke removes all session keys
- [ ] Audit log captures all events
- [ ] Solana guard program deployed on devnet
- [ ] PDA vault deposit/withdraw works

### Phase 4: Dashboard
- [ ] Auth works (wallet connect)
- [ ] Real-time spend display
- [ ] CRUD for guardrails and session keys
- [ ] Revoke from dashboard triggers on-chain

### Phase 5: Integrations
- [ ] ElizaOS example runs end-to-end
- [ ] Virtuals example runs end-to-end
- [ ] Cod3x example compiles and has README

---
*Requirements: 2026-02-24*

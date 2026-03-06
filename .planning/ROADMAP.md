# x402Guard Roadmap

## Milestone: MVP v1.0

**Timeline:** 8 weeks (Feb–Apr 2026)
**Goal:** Working x402 proxy on Base + Solana with guardrails, session keys, dashboard, and 3 integration examples.

---

### Phase 0: Repository Setup & Infrastructure

**Goal:** Complete project skeleton — Rust proxy compiles, Next.js runs, Docker orchestrates, CI validates.

**Scope:**
- Complete Next.js 15 dashboard skeleton (App Router + Tailwind + shadcn/ui)
- Docker Compose: proxy + Postgres + Redis
- GitHub Actions CI (cargo check + test + clippy + next build)
- Rate limit middleware stub with Redis connection
- README with setup instructions
- Verify: `cargo check`, `npm run dev`, `docker compose up`

**Success Criteria:**
- Cargo workspace compiles clean
- Next.js dashboard starts and shows landing page
- Docker compose brings up proxy + postgres + redis
- CI passes on push
- Health endpoint returns 200 from Docker

**Estimated Effort:** 1 week
**Requirements:** FR-5.3 (global rate limit stub), NFR-6, NFR-7

---

### Phase 1: Core x402 Proxy + Payment Verification

**Goal:** Proxy receives x402 payment requests, verifies EIP-3009 signatures, enforces rate limits, prevents replay attacks, and forwards to target service.

**Scope:**
- x402 types: `PaymentRequirements`, `PaymentProof`, `TransferAuthorization`
- EIP-712 signature recovery using `alloy`
- EIP-3009 `TransferWithAuthorization` verification
- Redis-backed nonce deduplication (`SET NX EX`)
- Sliding window rate limiting (per-agent + global)
- Request forwarding via `reqwest` to target URL
- Input validation on `ProxyRequest` (URL whitelist, schema validation)
- CORS lockdown (configurable allowed origins)
- Comprehensive test suite (80%+ coverage on middleware)

**Success Criteria:**
- Valid x402 payment proxied successfully
- Invalid EIP-3009 signature rejected (401)
- Replayed nonce rejected (409)
- Rate limit exceeded returns 429 with Retry-After
- SSRF prevented via target URL validation
- Tests pass with 80%+ coverage

**Estimated Effort:** 2 weeks
**Requirements:** FR-1.1–FR-1.6, FR-5.1, FR-5.3, FR-5.4

---

### Phase 2: Guardrails Engine + EIP-7702 Session Keys

**Goal:** Configurable safety rules enforced on every transaction. Session keys created, verified, and tracked on Base.

**Scope:**
- Guardrails middleware: MaxSpendPerTx, MaxSpendPerDay, AllowedContracts, MaxLeverage, MaxSlippage
- Guardrail rules stored in Supabase, cached in Redis
- SessionKeyValidator Solidity contract (Foundry project)
- Deploy to Base Sepolia
- EIP-7702 middleware: verify session key delegation, check scope/expiry/spend
- Session key CRUD API endpoints
- Guardrail rule CRUD API endpoints
- Supabase schema for agents, session_keys, guardrail_rules

**Success Criteria:**
- MaxSpendPerTx blocks oversized transactions (403)
- MaxSpendPerDay enforces rolling 24h window
- AllowedContracts blocks unauthorized targets
- SessionKeyValidator passes Foundry fork tests
- Session keys created via API and verified on-chain
- Expired/revoked keys rejected

**Estimated Effort:** 2 weeks
**Requirements:** FR-2.1–FR-2.7, FR-3.1–FR-3.3, FR-3.6, FR-5.2

---

### Phase 3: Revoke System + Audit Logs + Solana Guard

**Goal:** Instant revocation on both chains, immutable audit trail, Solana guard program live on devnet.

**Scope:**
- One-click revoke: EIP-7702 zero-address delegation (Base)
- Individual session key revocation
- Revoke API endpoints
- Audit log table in Supabase (append-only, immutable)
- Log all proxy requests, guardrail violations, session key events
- Solana Anchor program: `initialize_vault`, `deposit`, `guarded_withdraw`, `revoke_agent`, `update_rules`
- SPL Token USDC integration
- PDA vault with per-tx limit, daily cap, program whitelist
- Deploy to Solana devnet
- Rust proxy integration with `anchor-client`

**Success Criteria:**
- One-click revoke removes all session keys (Base)
- Audit log captures every event with correct metadata
- Solana vault accepts deposit and enforces guarded withdrawal
- Solana revoke zeroes agent access in ~400ms
- Integration tests pass for both chains

**Progress:** Plans 1,2,3 of 4 complete (Plan 4: Integration Tests remaining)

**Estimated Effort:** 2 weeks
**Requirements:** FR-3.4–FR-3.5, FR-4.1–FR-4.6, FR-6.1–FR-6.4

---

### Phase 4: Dashboard (Full Control UI)

**Goal:** Web dashboard where users monitor agents, configure guardrails, manage session keys, and revoke access.

**Scope:**
- Supabase Auth integration (wallet connect via RainbowKit/wagmi)
- Agent overview page (status, spend, active keys)
- Real-time spend monitoring (Supabase Realtime subscriptions)
- Transaction log viewer with filters (date, agent, type)
- Guardrail rule CRUD UI (create, edit, delete per agent)
- Session key management UI (create, view, revoke)
- One-click revoke all keys button
- Alert indicators when agents approach limits
- Responsive layout (desktop-first)
- shadcn/ui components throughout

**Success Criteria:**
- User can sign in via wallet
- Dashboard shows real-time agent spend
- User can create guardrail rules from UI
- User can create and revoke session keys from UI
- One-click revoke triggers on-chain transaction
- Alert shows when agent > 80% of limit

**Estimated Effort:** 1.5 weeks
**Requirements:** FR-7.1–FR-7.9, FR-6.5

---

### Phase 5: Integration Examples

**Goal:** Working examples for ElizaOS, Virtuals Protocol, and Cod3x showing how to integrate x402Guard.

**Scope:**
- ElizaOS plugin (`@elizaos/plugin-x402guard`): TypeScript, wraps WalletProvider
- Virtuals Protocol GAME plugin: Python, wraps DeFi function calls
- Cod3x adapter: TypeScript, protocol adapter pattern
- Each example: README, setup instructions, demo script
- End-to-end test for ElizaOS and Virtuals examples

**Success Criteria:**
- ElizaOS example runs and makes guarded x402 payment
- Virtuals example runs and makes guarded x402 payment
- Cod3x example compiles and has working README
- All READMEs include step-by-step setup

**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md -- Shared @x402guard/core TypeScript SDK (client, types, errors, retry)
- [ ] 05-02-PLAN.md -- ElizaOS plugin (Action + Provider + demo + README)
- [ ] 05-03-PLAN.md -- Virtuals Protocol GAME Python plugin (client, functions, demo + README)
- [ ] 05-04-PLAN.md -- Cod3x adapter (protocol adapter + demo + README + CI)

**Estimated Effort:** 1 week
**Requirements:** FR-8.1–FR-8.4

---

## Phase Dependencies

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 5
                                  ↘
                                   Phase 4 (can start after Phase 2)
```

Phase 4 (dashboard) can begin once Phase 2 API endpoints exist.
Phase 5 (integrations) requires Phase 3 (both chains working).

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| EIP-7702 alloy API changes since Aug 2025 | HIGH | Verify against current alloy docs in Phase 2 |
| Solana Anchor syntax changes | MEDIUM | Pin Anchor version, test on devnet early |
| x402 header format evolution | MEDIUM | Check Coinbase x402 repo before Phase 1 |
| Cod3x SDK unavailable/unstable | LOW | Deprioritize to SHOULD, focus on ElizaOS+Virtuals |
| Base Sepolia testnet instability | LOW | Use Foundry fork tests as fallback |

---
*Roadmap: 2026-02-24*

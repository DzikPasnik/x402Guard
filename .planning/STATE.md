# x402Guard Project State

## Current Phase

**Phase 2: EIP-7702 Session Keys + Guardrails** — NEXT

(Phase 0: Repository Setup & Infrastructure — COMPLETE)
(Phase 1: Core x402 Proxy + Payment Verification — COMPLETE)

## What's Done

### Phase 0 — Repository Setup & Infrastructure
- [x] Git repo initialized
- [x] Cargo workspace with `proxy/` crate
- [x] Rust proxy skeleton: main, config, error, router, handlers (health + proxy), middleware stubs, models
- [x] Dockerfile for Rust proxy (multi-stage)
- [x] .gitignore, LICENSE (MIT), .env.example
- [x] Codebase mapped (7 documents in .planning/codebase/)
- [x] PROJECT.md with validated requirements
- [x] Domain research (4 documents in .planning/research/)
- [x] REQUIREMENTS.md with full FR/NFR breakdown
- [x] ROADMAP.md with 6 phases
- [x] Next.js 15 dashboard skeleton
- [x] Docker Compose (proxy + postgres + redis)
- [x] GitHub Actions CI (cargo check + test + clippy + next build)
- [x] Rate limit middleware stub with Redis connection pool
- [x] README.md with setup instructions

### Phase 1 — Core x402 Proxy + Payment Verification
- [x] x402 header parsing (base64url → JSON PaymentRequirements + PaymentPayload)
- [x] EIP-3009 TransferWithAuthorization types (from, to, value, validAfter, validBefore, nonce)
- [x] EIP-712 signature verification (USDC domain on Base Mainnet + Base Sepolia)
- [x] USDC network resolution (base-mainnet, base-sepolia with correct contract addresses)
- [x] Full proxy handler: validate → parse → verify → nonce check → rate limit → forward
- [x] Redis nonce deduplication (SET NX EX, fail-closed on Redis errors)
- [x] Redis sliding window rate limiter (ZADD + ZREMRANGEBYSCORE + ZCARD, atomic counter fix)
- [x] SSRF prevention: HTTPS-only, no credentials, private IP blocking, CGNAT, IPv4-mapped IPv6
- [x] Request body size limit (256KB via DefaultBodyLimit)
- [x] CORS fail-closed (defaults to localhost-only, never permissive)
- [x] Nonce TTL clamping (min 60s, max 86400s to prevent Redis exhaustion)
- [x] Decimal-only value parsing (rejects hex-prefixed amounts to prevent confusion)
- [x] 19 unit tests passing (signature verification, SSRF, rate limiting)
- [x] Security audit completed: 3 CRITICAL + 3 MEDIUM issues found and fixed

## Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-24 | PDA vault for Solana (not SPL approve) | Stronger non-custodial guarantee, better investor optics |
| 2026-02-24 | Both key flows (dashboard + API) | Manual setup via dashboard, automation via API requests |
| 2026-02-24 | Proxy-only verification (non-custodial) | Proxy verifies signatures and forwards — never holds funds |
| 2026-02-24 | EIP-3009 as primary payment scheme | x402 `exact` scheme uses USDC's native TransferWithAuthorization |
| 2026-02-25 | Pin serde = "=1.0.219" | serde_core split (1.0.223+) breaks alloy-consensus's serde::__private usage |
| 2026-02-25 | alloy features: sol-types + signers + signer-local | Avoids blst C dependency that requires MSVC/gcc on Windows |
| 2026-02-25 | Docker-based Rust builds | Windows lacks MSVC Build Tools; Docker rust:1.85-slim is reliable |
| 2026-02-25 | Decimal-only value parsing | Prevents hex/decimal amount confusion attack on EIP-3009 values |

## Known Security Debt (Phase 2+)

- **M4**: Resource URL mismatch — proxy doesn't validate that target_url matches requirements.resource
- **M5**: Asset address cross-validation — proxy doesn't verify payment asset matches requirements.asset
- **DNS rebinding**: Custom reqwest DNS resolver needed for full SSRF protection (noted in code)

## Build Commands

```bash
# Docker-based build (required on Windows without MSVC)
MSYS_NO_PATHCONV=1 docker run --rm -v "D:/x402Guard:/app" -w /app rust:1.85-slim \
  bash -c "apt-get update -qq && apt-get install -y -qq pkg-config libssl-dev > /dev/null 2>&1 && cargo test 2>&1"
```

## Context for Next Session

Phase 1 is complete with all security fixes applied and 19/19 tests passing.
Phase 2 covers EIP-7702 session keys and guardrails engine.

---
*Updated: 2026-02-25*

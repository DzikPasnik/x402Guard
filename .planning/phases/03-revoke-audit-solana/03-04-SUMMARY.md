---
phase: 03-revoke-audit-solana
plan: 04
subsystem: api
tags: [solana, json-rpc, pda, ed25519, vault, base58, curve25519-dalek, sha2, reqwest]

# Dependency graph
requires:
  - phase: 03-revoke-audit-solana/03-01
    provides: AuditWriter + audit_log table + AuditEvent types
  - phase: 03-revoke-audit-solana/03-02
    provides: Revoke system + agent deactivation
  - phase: 03-revoke-audit-solana/03-03
    provides: VaultState on-chain schema (Anchor guard program)
provides:
  - Solana JSON-RPC client (reqwest-based, zero solana-sdk dependency)
  - VaultState deserialization from raw on-chain bytes
  - PDA derivation (vault + ATA) with ed25519 curve check
  - Base58 codec for Solana pubkeys
  - GET /api/v1/solana/vault/:owner_pubkey endpoint
  - POST /api/v1/proxy/solana endpoint (read-only pre-flight validation)
  - 4 Solana audit event types
  - SQL migration 003 for Solana event types
affects: [dashboard, e2e-testing, deployment]

# Tech tracking
tech-stack:
  added: [sha2 0.10, curve25519-dalek 4.x]
  patterns: [reqwest JSON-RPC fallback, manual borsh deserialization, PDA derivation]

key-files:
  created:
    - proxy/src/services/solana_rpc.rs
    - proxy/src/handlers/solana_vault.rs
    - proxy/migrations/003_add_solana_event_types.sql
  modified:
    - proxy/src/config.rs
    - proxy/src/handlers/proxy.rs
    - proxy/src/handlers/mod.rs
    - proxy/src/router.rs
    - proxy/src/services/mod.rs
    - proxy/src/models/audit_event.rs
    - proxy/Cargo.toml
    - Cargo.toml

key-decisions:
  - "Reqwest JSON-RPC fallback instead of solana-sdk (avoids serde =1.0.219 conflict)"
  - "sha2 + curve25519-dalek for PDA derivation (pure Rust, no C deps)"
  - "Manual borsh deserialization for VaultState (skip Anchor discriminator + fixed-layout fields)"
  - "Separate POST /api/v1/proxy/solana endpoint for Solana payments (different validation flow from EVM)"
  - "Best-effort USDC balance query (ATA may not exist yet)"

patterns-established:
  - "Reqwest JSON-RPC pattern: lightweight Solana reads without solana-sdk dependency conflict"
  - "Manual PDA derivation: SHA-256(seeds || program_id || 'ProgramDerivedAddress') with ed25519 curve rejection"
  - "Pre-flight validation: proxy reads on-chain state, validates limits, forwards request (defense-in-depth)"

requirements-completed: []

# Metrics
duration: 16min
completed: 2026-03-01
---

# Phase 3 Plan 4: Proxy-Solana Integration Summary

**Reqwest-based Solana JSON-RPC client with PDA derivation, vault status endpoint, and read-only pre-flight payment validation**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-01T00:32:54Z
- **Completed:** 2026-03-01T00:48:39Z
- **Tasks:** 6 (Steps 1b, 2, 3, 4, 5, 6)
- **Files modified:** 11

## Accomplishments
- Lightweight Solana JSON-RPC client using existing reqwest (avoids solana-sdk serde conflict entirely)
- Correct PDA derivation using sha2 + curve25519-dalek for ed25519 curve check
- Full VaultState deserialization from raw Anchor account data (manual borsh parsing)
- Vault status REST API (GET /api/v1/solana/vault/:owner_pubkey)
- Solana x402 proxy pre-flight validation (POST /api/v1/proxy/solana)
- 4 Solana audit event types integrated with existing AuditWriter
- 34 new tests (102 total, up from 68)

## Task Commits

Each task was committed atomically:

1. **Steps 1b+2: Solana RPC client + config** - `3a2930b` (feat)
2. **Steps 3+4: Vault status endpoint + audit events** - `484fc04` (feat)
3. **Step 5: Solana proxy payment flow** - `dfc00b6` (feat)
4. **Step 6: Additional unit tests** - `be84f4a` (test)

## Files Created/Modified

- `proxy/src/services/solana_rpc.rs` - Solana JSON-RPC client: base58 codec, VaultState deserialization, PDA/ATA derivation, getAccountInfo/getTokenAccountBalance
- `proxy/src/handlers/solana_vault.rs` - GET /api/v1/solana/vault/:owner_pubkey — read-only vault status query
- `proxy/migrations/003_add_solana_event_types.sql` - ALTER CHECK constraint for 4 new Solana event types
- `proxy/src/config.rs` - Added solana_rpc_url, solana_program_id, solana_usdc_mint (all optional), with HTTPS/pubkey validation
- `proxy/src/handlers/proxy.rs` - POST /api/v1/proxy/solana — Solana x402 pre-flight validation with vault state checks
- `proxy/src/handlers/mod.rs` - Added solana_vault module
- `proxy/src/router.rs` - Merged solana_vault routes
- `proxy/src/services/mod.rs` - Added solana_rpc module
- `proxy/src/models/audit_event.rs` - 4 new event types: SolanaVaultQueried, SolanaWithdrawSubmitted, SolanaWithdrawConfirmed, SolanaWithdrawFailed
- `Cargo.toml` - Added sha2, curve25519-dalek workspace deps
- `proxy/Cargo.toml` - Added sha2, curve25519-dalek proxy deps

## Decisions Made

1. **Reqwest JSON-RPC fallback** — solana-sdk v1.18 conflicts with serde = "=1.0.219" pin (required for alloy-consensus). Used raw reqwest POST for `getAccountInfo` and `getTokenAccountBalance`. Zero new heavy deps.

2. **sha2 + curve25519-dalek for PDA derivation** — Pure Rust crates, no C compilation needed. `curve25519-dalek::CompressedEdwardsY::decompress()` provides correct ed25519 curve check for PDA validation.

3. **Manual borsh deserialization** — VaultState is fixed-layout: skip 8-byte Anchor discriminator, read fields sequentially. Avoids pulling in borsh crate and keeps the dependency tree minimal.

4. **Separate Solana proxy endpoint** — `POST /api/v1/proxy/solana` is distinct from the EVM `POST /api/v1/proxy` because the validation flow is fundamentally different (on-chain vault state vs EIP-3009 signatures). Clean separation, no if/else branching in the hot path.

5. **Best-effort USDC balance** — The vault's ATA may not exist yet (no deposits). Balance query failure returns `null` instead of erroring. This is informational only — on-chain enforcement is the real protection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ed25519 curve check in PDA derivation**
- **Found during:** Step 1b (initial implementation)
- **Issue:** Custom big integer modular arithmetic for ed25519 point decompression had bugs in 512-bit modular reduction. All 256 bumps were incorrectly classified as "on curve," causing PDA derivation to fail.
- **Fix:** Replaced ~250 lines of manual field arithmetic with `curve25519_dalek::edwards::CompressedEdwardsY::decompress()` (3 lines). Added `sha2` and `curve25519-dalek` as explicit workspace deps.
- **Files modified:** proxy/src/services/solana_rpc.rs, Cargo.toml, proxy/Cargo.toml
- **Verification:** PDA derivation tests pass (deterministic, different owners, not-on-curve assertion)
- **Committed in:** 3a2930b (part of Step 1b+2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness. The curve25519-dalek dependency was a better engineering choice than manual field arithmetic. No scope creep.

## Issues Encountered
- Step 1 (solana-sdk dependency) was skipped as expected — serde pin conflict is well-documented. Went directly to Step 1b (reqwest fallback) as the plan anticipated.

## User Setup Required

To enable Solana support, set these environment variables:
- `SOLANA_RPC_URL` — Solana RPC endpoint (e.g., `https://api.devnet.solana.com`)
- `SOLANA_PROGRAM_ID` — x402-guard program ID (base58)
- `SOLANA_USDC_MINT` — USDC SPL mint address on target cluster (base58)

All three must be set to enable Solana features. Without them, Solana endpoints return "not configured" errors.

## Next Phase Readiness
- Proxy now supports both EVM (Base) and Solana payment flows
- Phase 3 is complete (all 4 plans done: audit log, revoke, Solana program, proxy integration)
- Ready for Phase 4 (Dashboard) or Phase 5 (E2E testing)
- Docker build still works with serde = "=1.0.219" pin intact

## Self-Check: PASSED

All 6 created/modified files verified on disk. All 4 task commits verified in git log.

---
*Phase: 03-revoke-audit-solana*
*Completed: 2026-03-01*

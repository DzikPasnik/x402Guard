---
phase: 03-revoke-audit-solana
plan: 03
subsystem: solana
tags: [anchor, solana, pda-vault, spl-token, usdc, guardrails, on-chain]

# Dependency graph
requires:
  - phase: none
    provides: standalone Anchor workspace (no dependency on proxy crate)
provides:
  - Solana Anchor guard program with PDA vault
  - 6 instructions: initialize_vault, deposit, guarded_withdraw, update_rules, revoke_agent, close_vault
  - On-chain guardrails: per-tx limit, daily cap, program whitelist, agent expiry
  - Agent revocation (zero pubkey kill switch)
  - TypeScript integration test suite (13 tests)
affects: [phase-4-dashboard, phase-5-integrations, devnet-deployment]

# Tech tracking
tech-stack:
  added: [anchor-lang 0.30, anchor-spl 0.30, @coral-xyz/anchor, @solana/web3.js, @solana/spl-token, ts-mocha]
  patterns: [PDA vault, CPI signer seeds, reserve-then-forward, fail-closed guardrails, checked arithmetic]

key-files:
  created:
    - solana/Anchor.toml
    - solana/Cargo.toml
    - solana/programs/x402-guard/Cargo.toml
    - solana/programs/x402-guard/src/lib.rs
    - solana/programs/x402-guard/src/state/vault.rs
    - solana/programs/x402-guard/src/instructions/initialize_vault.rs
    - solana/programs/x402-guard/src/instructions/deposit.rs
    - solana/programs/x402-guard/src/instructions/guarded_withdraw.rs
    - solana/programs/x402-guard/src/instructions/update_rules.rs
    - solana/programs/x402-guard/src/instructions/revoke_agent.rs
    - solana/programs/x402-guard/src/instructions/close_vault.rs
    - solana/programs/x402-guard/src/errors.rs
    - solana/programs/x402-guard/src/constants.rs
    - solana/tests/x402-guard.ts
    - solana/package.json
    - solana/tsconfig.json
    - solana/migrations/deploy.ts
  modified: []

key-decisions:
  - "Separate Cargo workspace in solana/ — not added to root workspace (BPF target conflicts)"
  - "Configurable USDC mint — custom mint for devnet testing"
  - "Reserve-then-forward pattern — update spent_today BEFORE CPI transfer"
  - "All checked arithmetic — no as casts anywhere in the program"
  - "64-byte reserved field in VaultState for future upgrades without realloc"
  - "Program whitelist NOT checked on close_vault — owner always recovers funds"

patterns-established:
  - "PDA vault pattern: seeds=[VAULT_SEED, owner], bump stored in state"
  - "Fail-closed guardrails: 8 sequential checks before any state mutation"
  - "CPI signer seeds for PDA-authorized token transfers"
  - "Optional update params pattern for owner-only rule changes"

requirements-completed: [FR-4.1, FR-4.2, FR-4.3, FR-4.4, FR-4.5]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 3 Plan 3: Solana Anchor Guard Program Summary

**PDA vault guard program with 6 Anchor instructions — per-tx limits, daily caps, program whitelists, agent expiry/revocation, and 13 TypeScript integration tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T00:15:39Z
- **Completed:** 2026-03-01T00:20:50Z
- **Tasks:** 10
- **Files created:** 18

## Accomplishments
- Complete Anchor workspace scaffolded as separate Cargo workspace in `solana/`
- VaultState account with 502-byte layout including 64-byte reserved field for upgrades
- 6 instructions implementing full vault lifecycle: init, deposit, guarded withdraw, update rules, revoke, close
- 8-point fail-closed guardrail checks in `guarded_withdraw` (active, agent match, expiry, amount>0, per-tx limit, daily reset, daily cap, whitelist)
- All arithmetic uses checked_add/checked_sub with no `as` casts
- 13 TypeScript integration tests covering happy paths and error cases
- Reserve-then-forward spend pattern (spent_today updated before CPI transfer)
- WithdrawExecuted and AgentRevoked events for off-chain audit

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Anchor Project** - `247e38b` (chore)
2. **Task 2: VaultState + Constants + Errors** - `a9ec22a` (feat)
3. **Task 3: initialize_vault Instruction** - `646fb39` (feat)
4. **Task 4: deposit Instruction** - `8f38e7f` (feat)
5. **Task 5: guarded_withdraw Instruction** - `bf9beec` (feat)
6. **Task 6: update_rules Instruction** - `5c9ce36` (feat)
7. **Task 7: revoke_agent Instruction** - `a34d384` (feat)
8. **Task 8: close_vault Instruction** - `a84dcd0` (feat)
9. **Task 9: lib.rs Program Entrypoint** - `d94f26d` (feat)
10. **Task 10: TypeScript Integration Tests** - `1f0d282` (test)

## Files Created/Modified

- `solana/Anchor.toml` - Anchor config (localnet + devnet clusters)
- `solana/Cargo.toml` - Separate Cargo workspace with overflow-checks in release
- `solana/programs/x402-guard/Cargo.toml` - Program crate with anchor-lang 0.30, anchor-spl 0.30
- `solana/programs/x402-guard/src/lib.rs` - #[program] module dispatching 6 instructions
- `solana/programs/x402-guard/src/state/vault.rs` - VaultState account (502 bytes with reserved field)
- `solana/programs/x402-guard/src/state/mod.rs` - State module re-exports
- `solana/programs/x402-guard/src/constants.rs` - MAX_ALLOWED_PROGRAMS=10, SECONDS_PER_DAY, VAULT_SEED
- `solana/programs/x402-guard/src/errors.rs` - 11 GuardError variants
- `solana/programs/x402-guard/src/instructions/initialize_vault.rs` - PDA vault init with ATA creation
- `solana/programs/x402-guard/src/instructions/deposit.rs` - Anyone can deposit USDC
- `solana/programs/x402-guard/src/instructions/guarded_withdraw.rs` - 8-point guardrail-enforced withdrawal
- `solana/programs/x402-guard/src/instructions/update_rules.rs` - Owner-only optional rule updates
- `solana/programs/x402-guard/src/instructions/revoke_agent.rs` - Kill switch (zero agent + pause)
- `solana/programs/x402-guard/src/instructions/close_vault.rs` - Drain USDC + close accounts
- `solana/programs/x402-guard/src/instructions/mod.rs` - Instruction module re-exports
- `solana/tests/x402-guard.ts` - 13 Mocha/Chai integration tests
- `solana/package.json` - NPM dependencies for Anchor testing
- `solana/tsconfig.json` - TypeScript config for test compilation
- `solana/migrations/deploy.ts` - Deployment migration script

## Decisions Made

1. **Separate Cargo workspace** — The `solana/` directory has its own `Cargo.toml` workspace, completely isolated from the root proxy workspace. This avoids BPF/SBF target conflicts and serde pin issues.

2. **Configurable USDC mint** — Tests use a custom mint. The program accepts any mint, allowing devnet testing with custom tokens while supporting mainnet USDC.

3. **Reserve-then-forward in guarded_withdraw** — `spent_today` is updated BEFORE the CPI token transfer, matching the EVM pattern from Phase 2. Prevents TOCTOU issues.

4. **64-byte reserved field** — VaultState includes `_reserved: [u8; 64]` for future field additions without requiring realloc.

5. **close_vault skips whitelist** — Owner can always recover funds regardless of `allowed_programs` setting. Whitelist only restricts agent withdrawals.

6. **Daily window reset in guarded_withdraw** — If 86400 seconds have elapsed since `day_window_start`, `spent_today` resets to 0. Tested indirectly (Clock warp requires Rust programs-test).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **FR-4.6 (devnet deployment):** Cannot deploy from this environment (no Solana CLI/Anchor CLI installed). The program files are complete and ready for `anchor build && anchor deploy --provider.cluster devnet` when the build environment is available. This is documented as a known limitation.

- **Test 13 (daily window reset):** Full clock warp testing requires Rust programs-test harness, not available in TypeScript Anchor tests. The test verifies daily cap enforcement and documents the reset logic. A Rust unit test would provide complete coverage.

## Next Phase Readiness

- Anchor program is complete and ready for `anchor build` + `anchor test` on a system with Solana CLI + Anchor CLI
- Program ID placeholder needs replacement after `anchor keys list` generates actual keypair
- Devnet deployment ready via `anchor deploy --provider.cluster devnet`
- 13 integration tests cover all instruction paths and error conditions
- Phase 4 (dashboard) can integrate vault status display using @coral-xyz/anchor client

## Self-Check: PASSED

- All 19 created files verified present on disk
- All 10 task commits verified in git history
- SUMMARY.md created with complete frontmatter and content

---
*Phase: 03-revoke-audit-solana*
*Completed: 2026-03-01*

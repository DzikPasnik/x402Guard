# Phase 3: Solana Guard Program - Research

**Researched:** 2026-02-28
**Domain:** Solana Anchor Program (PDA Vault + Guardrails)
**Confidence:** MEDIUM (web access unavailable -- all findings from training data cutoff May 2025 + existing project research from Feb 2026; version numbers MUST be verified before implementation)

## Summary

The Solana guard program for x402Guard implements a PDA-based vault with on-chain guardrails. This is a well-established pattern in the Solana ecosystem (used by Squads, Drift, Marinade, and many DeFi protocols). The program uses Anchor framework conventions: a `VaultState` PDA holds configuration (rules, agent pubkey, spend counters), a program-owned Associated Token Account holds USDC, and program logic enforces rules on every `guarded_withdraw`.

The core technical challenges are: (1) daily spend tracking using Clock sysvar with simple window reset (not true sliding window -- too expensive on-chain), (2) program whitelist enforcement adapted for Solana's account model (destination token account owner check, not EVM-style contract call), and (3) proxy-side integration using `anchor-client` or `solana-client` crates. The Anchor program itself is straightforward; the main risks are version compatibility (Anchor 0.29/0.30 had breaking changes) and build toolchain setup (Anchor requires a separate build from the Rust proxy).

**Primary recommendation:** Create a separate `solana/` directory with a standard Anchor project. Use Anchor 0.30.x (verify latest on crates.io). Build and deploy via Docker with `anchor-cli` installed. The Anchor program is an independent artifact from the proxy -- it compiles to a BPF/SBF target, not x86. The proxy integrates via `solana-client` + `anchor-client` crates for RPC transaction submission.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FR-4.1 | Initialize PDA vault per user with configurable rules | PDA vault pattern (Section 2), VaultState struct with seeds `["vault", user_pubkey]`, init with ATA for USDC |
| FR-4.2 | Deposit USDC into PDA vault | Standard SPL Token CPI transfer from user ATA to vault ATA (Section 3) |
| FR-4.3 | Guarded withdrawal with per-tx limit, daily cap, program whitelist | Core guardrail logic in `guarded_withdraw` instruction -- per-tx check, daily window reset, `allowed_programs` contains check (Section 4) |
| FR-4.4 | Revoke agent access (zero out agent pubkey) | Single instruction overwriting `vault.agent` with `Pubkey::default()` + `is_active = false` (Section 5) |
| FR-4.5 | Update vault rules (owner-only) | `update_rules` instruction with owner Signer constraint, Optional fields for partial updates (Section 6) |
| FR-4.6 | Deploy guard program on Solana devnet | Anchor CLI `anchor build && anchor deploy --provider.cluster devnet` (Section 9) |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| anchor-lang | 0.30.x (VERIFY) | Anchor framework for Solana programs | De facto standard for Solana program development; account validation, CPI helpers, IDL generation |
| anchor-spl | 0.30.x (VERIFY) | SPL Token integration for Anchor | Provides `Token`, `Mint`, `TokenAccount`, `AssociatedToken` account types and CPI wrappers |
| spl-token | 4.x (VERIFY) | SPL Token program interfaces | Required for token transfer CPI calls |
| spl-associated-token-account | 3.x (VERIFY) | ATA program interfaces | Deterministic token account derivation |

### Supporting (Proxy-side Integration)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| solana-client | 1.18.x or 2.x (VERIFY) | Async RPC client | Submitting transactions from Rust proxy to Solana network |
| solana-sdk | 1.18.x or 2.x (VERIFY) | Core Solana types (Pubkey, Transaction, Keypair) | Building and signing transactions in the proxy |
| anchor-client | 0.30.x (VERIFY) | High-level Anchor program client | Calling Anchor program instructions with typed IDL |

### Build Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| Anchor CLI | 0.30.x (VERIFY) | Build, test, deploy Anchor programs |
| Solana CLI | 1.18.x or 2.x (VERIFY) | Keypair management, devnet faucet, deployment |
| Node.js | 18+ | Anchor test runner (Mocha/Chai) |
| Rust | 1.79+ | Anchor 0.30 requires recent Rust (VERIFY) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Anchor framework | Raw solana-program | 10x more boilerplate, no IDL, no account validation macros. Never do this for new projects. |
| anchor-client (proxy) | Raw solana-client + manual instruction building | More control but must manually serialize instruction data. anchor-client handles IDL-based serialization automatically. |
| SPL Token (original) | Token-2022 (Token Extensions) | USDC on Solana mainnet uses original SPL Token program as of training cutoff. Token-2022 would add complexity without benefit for USDC. VERIFY current USDC token program. |

### CRITICAL VERSION NOTE

**Solana ecosystem underwent major versioning changes in 2024-2025.** The Solana Labs validator was forked to Anza/Agave. This may affect crate naming:
- `solana-sdk` may have become `agave-sdk` or remained under `solana-sdk`
- `solana-client` similarly
- Anchor 0.30 may target Solana SDK 1.18 or 2.0

**Action required:** Before writing any `Cargo.toml`, run `cargo search anchor-lang` and `cargo search solana-sdk` inside Docker to get actual latest versions. Pin exact versions in Cargo.toml.

### Installation (Anchor program)

```toml
# programs/x402-guard/Cargo.toml
[dependencies]
anchor-lang = "0.30"  # VERIFY exact version
anchor-spl = "0.30"   # VERIFY, must match anchor-lang
```

### Installation (Proxy-side integration)

```toml
# proxy/Cargo.toml additions
solana-client = "1.18"   # VERIFY -- may be 2.x by now
solana-sdk = "1.18"      # VERIFY -- must match solana-client
anchor-client = "0.30"   # VERIFY -- must match anchor-lang
```

**WARNING:** `solana-sdk` pulls in a large dependency tree. This WILL significantly increase proxy compile time and binary size. Consider feature-gating Solana support behind a Cargo feature flag:

```toml
[features]
default = []
solana = ["dep:solana-client", "dep:solana-sdk", "dep:anchor-client"]

[dependencies]
solana-client = { version = "1.18", optional = true }
solana-sdk = { version = "1.18", optional = true }
anchor-client = { version = "0.30", optional = true }
```

## Architecture Patterns

### Recommended Project Structure

```
x402Guard/
├── proxy/                    # Existing Rust proxy (axum)
│   └── Cargo.toml            # Add solana-client, anchor-client as optional deps
├── solana/                   # NEW: Anchor project root
│   ├── Anchor.toml           # Anchor config (clusters, program IDs, wallet)
│   ├── Cargo.toml            # Workspace for programs + (optional) local crates
│   ├── programs/
│   │   └── x402-guard/
│   │       ├── Cargo.toml    # anchor-lang, anchor-spl
│   │       └── src/
│   │           ├── lib.rs              # Program entrypoint + #[program] module
│   │           ├── state/
│   │           │   ├── mod.rs
│   │           │   └── vault.rs        # VaultState account struct
│   │           ├── instructions/
│   │           │   ├── mod.rs
│   │           │   ├── initialize_vault.rs
│   │           │   ├── deposit.rs
│   │           │   ├── guarded_withdraw.rs
│   │           │   ├── update_rules.rs
│   │           │   ├── revoke_agent.rs
│   │           │   └── close_vault.rs
│   │           ├── errors.rs           # GuardError enum
│   │           └── constants.rs        # USDC_MINT, MAX_ALLOWED_PROGRAMS
│   ├── tests/
│   │   └── x402-guard.ts      # Anchor integration tests (Mocha)
│   ├── migrations/
│   │   └── deploy.ts          # Deployment script
│   ├── tsconfig.json
│   └── package.json           # @coral-xyz/anchor, @solana/web3.js, mocha, chai
├── Cargo.toml                 # Root workspace -- do NOT include solana/ here
└── docker-compose.yml
```

**IMPORTANT:** The Anchor project (`solana/`) has its OWN Cargo workspace. It MUST NOT be added to the root `Cargo.toml` workspace members because:
1. Anchor programs compile to BPF/SBF target (not native x86)
2. The `anchor build` command manages the Cargo build internally
3. Mixing BPF and native targets in one workspace causes build issues
4. Different Rust toolchain requirements (Solana BPF SDK uses specific nightly features)

### Pattern 1: PDA Vault with Program-Owned Token Account

**What:** User funds (USDC) are held in a token account whose authority is a Program Derived Address (PDA). Only the program can move funds by signing with the PDA seeds via `invoke_signed`.

**When to use:** Any time a program needs custodial control over tokens with enforced rules.

**Key accounts:**

```
VaultState PDA     seeds: ["vault", user_pubkey]    -- holds rules, counters
Vault ATA          authority: VaultState PDA          -- holds USDC
```

**Example:**
```rust
// PDA derivation -- deterministic per user
let (vault_pda, bump) = Pubkey::find_program_address(
    &[b"vault", user.key().as_ref()],
    program_id,
);

// Signing for CPI with PDA authority
let owner_key = vault.owner;
let seeds = &[b"vault".as_ref(), owner_key.as_ref(), &[vault.bump]];
let signer_seeds = &[&seeds[..]];

let cpi_ctx = CpiContext::new_with_signer(
    token_program.to_account_info(),
    Transfer {
        from: vault_token_account.to_account_info(),
        to: destination.to_account_info(),
        authority: vault.to_account_info(),
    },
    signer_seeds,
);
token::transfer(cpi_ctx, amount)?;
```

### Pattern 2: Daily Spend Window (Simple Reset)

**What:** Track daily spending using a window start timestamp. Reset counter when 24h has elapsed since window start.

**When to use:** On-chain daily caps where a true sliding window is too expensive.

**Example:**
```rust
let clock = Clock::get()?;
let seconds_elapsed = clock.unix_timestamp
    .checked_sub(vault.day_window_start)
    .ok_or(GuardError::ArithmeticOverflow)?;

if seconds_elapsed >= 86_400 {
    vault.spent_today = 0;
    vault.day_window_start = clock.unix_timestamp;
}

let new_total = vault.spent_today
    .checked_add(amount)
    .ok_or(GuardError::ArithmeticOverflow)?;
require!(new_total <= vault.max_spend_per_day, GuardError::ExceedsDailyCap);

// Update AFTER all checks pass
vault.spent_today = new_total;
```

**Trade-off:** This is "reset-on-first-tx-after-24h", not a true sliding window. An agent could theoretically spend `max_spend_per_day` right before reset, then `max_spend_per_day` again right after, doubling the effective daily limit in a short window. For MVP this is acceptable -- a true sliding window would require storing per-tx history (expensive on Solana at ~0.00089 SOL per 1KB of rent-exempt storage).

### Pattern 3: Program Whitelist (Destination Account Owner Check)

**What:** Verify that the destination token account's owner program is in the vault's allowed programs list.

**When to use:** Enforcing that withdrawals only go to approved protocols.

**Example:**
```rust
// The "program whitelist" on Solana means: which programs own
// the receiving token accounts. For x402 payments, this is the
// service/protocol the agent is paying.
require!(
    vault.allowed_programs.contains(&ctx.accounts.destination_token_account.owner),
    GuardError::ProgramNotWhitelisted
);
```

**Note:** On Solana, there's no "calling a contract" like EVM. The whitelist checks WHERE funds go (destination account owner), not WHICH program is invoked. For x402 payment flows, the destination is typically a service's receiving ATA, whose owner is a wallet (system program) or a protocol program.

**Alternative interpretation:** Whitelist could also mean "which programs can the agent's withdrawal eventually interact with." This is harder to enforce on-chain. For MVP, checking the destination token account's owner is sufficient and aligns with x402 flow.

### Anti-Patterns to Avoid

- **Storing unbounded Vec on-chain:** `allowed_programs: Vec<Pubkey>` must have a hard cap (MAX_ALLOWED_PROGRAMS = 10). Unbounded vectors can cause account size issues and compute budget blowouts from iteration.

- **Using `init_if_needed` without careful seed validation:** This feature was behind a feature gate in Anchor 0.29+ due to security concerns. If misused, it can allow re-initialization attacks. Prefer separate `initialize_vault` and explicit `init`.

- **Updating state before CPI (broken CEI):** In `guarded_withdraw`, update `spent_today` AFTER the token transfer CPI succeeds. On Solana, if the CPI fails the entire tx reverts anyway, but following CEI makes intent clear and prevents bugs if logic is refactored later.

- **Using `as u64` or `as i64` casts:** Consistent with the project's existing "checked casts everywhere" pattern. Use `.checked_add()`, `.checked_sub()`, `.try_into()` for all arithmetic. Financial code tolerates zero shortcuts.

- **Forgetting to store the bump:** Always store the PDA bump in the account state (`vault.bump = ctx.bumps.vault`). Re-deriving bumps on every instruction wastes compute units.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token transfers | Custom SPL Token instruction serialization | `anchor_spl::token::transfer` CPI | Anchor wraps SPL Token CPI with type safety; manual serialization is error-prone |
| ATA derivation | Manual seed calculation | `anchor_spl::associated_token` constraint macros | Anchor validates ATA derivation automatically via `associated_token::mint` / `associated_token::authority` |
| Account validation | Manual `if owner != expected` checks | Anchor `#[account]` constraints | Anchor constraints are audited, battle-tested, and generate clear error messages |
| PDA signing | Raw `invoke_signed` with manual seed assembly | `CpiContext::new_with_signer` | Less error-prone, integrates with Anchor's seed validation |
| IDL generation | Manual instruction serialization formats | `anchor build` generates IDL automatically | IDL drives TypeScript test client and proxy integration |
| Keypair management | Custom key file formats | Solana CLI `solana-keygen` + standard `~/.config/solana/id.json` | Ecosystem standard, works with all tooling |

**Key insight:** Anchor exists specifically to prevent the class of bugs that plague raw Solana programs. Every hand-rolled account validation is a potential privilege escalation vulnerability. Use Anchor constraints for ALL account validation.

## Common Pitfalls

### Pitfall 1: Anchor Version Mismatch Between Program and Client

**What goes wrong:** The Anchor program uses `anchor-lang 0.30` but the proxy uses `anchor-client 0.29`. IDL format differences cause deserialization failures. TypeScript tests use `@coral-xyz/anchor 0.28`. Nothing works together.

**Why it happens:** Anchor had breaking changes in 0.28 -> 0.29 -> 0.30 (IDL format, account validation macros, feature gates).

**How to avoid:** Pin ALL Anchor crates and npm packages to the same minor version. Create a `VERSIONS.md` or constants file documenting pinned versions.

**Warning signs:** `Error: Account discriminator mismatch`, `IDL parse error`, `unknown field` during deserialization.

### Pitfall 2: Solana SDK Version vs Validator Version Mismatch

**What goes wrong:** The proxy uses `solana-sdk 2.0` but devnet runs validator `1.18`. RPC calls fail with version negotiation errors.

**Why it happens:** Solana ecosystem underwent a major transition from Solana Labs to Anza/Agave. SDK versions may not match validator versions.

**How to avoid:** Check devnet validator version (`solana cluster-version --url devnet`) before pinning SDK versions. Use the SDK version that matches the target cluster.

**Warning signs:** `RPC request error`, `unsupported version`, transaction simulation failures.

### Pitfall 3: Docker Build Environment for Anchor Programs

**What goes wrong:** The project already uses Docker for Rust builds (Windows lacks MSVC). But Anchor programs require the Solana BPF SDK and `anchor-cli`, which need additional setup.

**Why it happens:** `anchor build` internally runs `cargo build-bpf` (or `cargo build-sbf` in newer versions), which requires the Solana BPF toolchain.

**How to avoid:** Create a separate Dockerfile for Anchor builds. Use `backpackapp/build:v0.30.1` (or similar official Anchor Docker images -- VERIFY availability). Alternatively, install `anchor-cli` and `solana-cli` in a custom Docker image based on `rust:1.79-slim`.

**Warning signs:** `error: no such command: build-bpf`, `BPF SDK not found`, `platform target not found`.

### Pitfall 4: Account Size Calculation Errors

**What goes wrong:** VaultState account is initialized with wrong size. If too small, deserialization fails. If too large, user overpays rent.

**Why it happens:** `Vec<Pubkey>` serialization includes 4 bytes for length prefix plus 32 bytes per entry. Developers forget the length prefix or miscalculate.

**How to avoid:** Pre-allocate maximum space upfront (assume MAX_ALLOWED_PROGRAMS entries). Use a constant function for space calculation:

```rust
impl VaultState {
    pub const MAX_ALLOWED_PROGRAMS: usize = 10;
    // 8 (discriminator) + 32 (owner) + 32 (agent) + 8 (max_spend_per_tx) +
    // 8 (max_spend_per_day) + 8 (spent_today) + 8 (day_window_start) +
    // 8 (agent_expires_at) + (4 + 32 * MAX) (allowed_programs) +
    // 1 (is_active) + 1 (bump) + 64 (reserved)
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + (4 + 32 * 10) + 1 + 1 + 64;
    // = 498 bytes
}
```

**Note:** Add 64 bytes of `_reserved: [u8; 64]` for future fields without needing `realloc`. This is a standard Anchor practice.

**Warning signs:** `Error: Account data too small`, `discriminator mismatch after resize`.

### Pitfall 5: USDC Devnet Mint Address is Not Stable

**What goes wrong:** Code hardcodes a devnet USDC mint that no longer exists or has no liquidity.

**Why it happens:** Circle's devnet USDC mint address changes. Community-created devnet "USDC" tokens come and go.

**How to avoid:** Make the USDC mint address a configuration parameter (passed to `initialize_vault` or set in program constants with a feature flag for devnet vs mainnet). For devnet testing, consider creating your own SPL token mint and using that as "USDC" -- it doesn't matter for testing the guard logic, only the mint address matching matters.

**Known addresses (VERIFY before use):**
- Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (HIGH confidence -- well-established)
- Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (LOW confidence -- may have changed)

**Warning signs:** `Error: Account not found` when fetching mint, zero-balance devnet token accounts.

### Pitfall 6: Compute Budget Exceeded

**What goes wrong:** `guarded_withdraw` with a large `allowed_programs` vec exceeds the default 200,000 compute unit limit.

**Why it happens:** Iterating through `Vec<Pubkey>` for whitelist check, plus CPI overhead for token transfer.

**How to avoid:** Cap `allowed_programs` at 10 entries. From the proxy client, always include `ComputeBudgetInstruction::set_compute_unit_limit(400_000)` in the transaction. Add priority fees via `ComputeBudgetInstruction::set_compute_unit_price(1_000)`.

**Warning signs:** `Transaction simulation failed: exceeded CUs meter`, transactions stuck in mempool.

### Pitfall 7: The Proxy's serde Pin Conflicts with Solana SDK

**What goes wrong:** The project pins `serde = "=1.0.219"` due to the serde_core split breaking `alloy-consensus`. Solana SDK crates may require a different serde version.

**Why it happens:** x402Guard already has this exact version pin (documented in STATE.md). Adding solana-sdk to the same workspace may create dependency resolution conflicts.

**How to avoid:** Keep the Anchor program in its own workspace (`solana/Cargo.toml`), completely separate from the root workspace. For proxy-side integration, test `solana-client` compatibility with `serde = "=1.0.219"` in Docker before committing to the integration approach. If incompatible, consider a microservice pattern where Solana transaction submission is a separate binary.

**Warning signs:** `cargo check` fails with `versions not compatible` on serde.

## Code Examples

### VaultState Account Structure

```rust
// Source: Anchor standard pattern (verified in Squads, Drift, multiple DeFi vaults)
use anchor_lang::prelude::*;

#[account]
pub struct VaultState {
    /// The user who owns this vault (can update rules, revoke, close)
    pub owner: Pubkey,              // 32 bytes

    /// The agent pubkey allowed to trigger guarded withdrawals
    /// Set to Pubkey::default() to revoke
    pub agent: Pubkey,              // 32 bytes

    /// Per-transaction USDC limit (6 decimals, e.g., 1_000_000 = 1 USDC)
    pub max_spend_per_tx: u64,      // 8 bytes

    /// Daily USDC cap (6 decimals)
    pub max_spend_per_day: u64,     // 8 bytes

    /// Amount spent in current daily window
    pub spent_today: u64,           // 8 bytes

    /// Unix timestamp when current daily window started
    pub day_window_start: i64,      // 8 bytes

    /// Agent key expiration (unix timestamp, 0 = no expiry)
    pub agent_expires_at: i64,      // 8 bytes

    /// Whitelisted destination program/wallet pubkeys (capped)
    pub allowed_programs: Vec<Pubkey>, // 4 + 32*N bytes

    /// Whether the vault is active (owner can pause without revoking)
    pub is_active: bool,            // 1 byte

    /// PDA bump seed (stored to avoid recomputation)
    pub bump: u8,                   // 1 byte

    /// Reserved space for future fields (avoids realloc)
    pub _reserved: [u8; 64],        // 64 bytes
}

impl VaultState {
    pub const MAX_ALLOWED_PROGRAMS: usize = 10;
    pub const SPACE: usize = 8   // discriminator
        + 32   // owner
        + 32   // agent
        + 8    // max_spend_per_tx
        + 8    // max_spend_per_day
        + 8    // spent_today
        + 8    // day_window_start
        + 8    // agent_expires_at
        + (4 + 32 * Self::MAX_ALLOWED_PROGRAMS) // allowed_programs
        + 1    // is_active
        + 1    // bump
        + 64;  // _reserved
}
```

### Initialize Vault Instruction

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = VaultState::SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeVault>,
    agent: Pubkey,
    max_spend_per_tx: u64,
    max_spend_per_day: u64,
    allowed_programs: Vec<Pubkey>,
    agent_expires_at: i64,
) -> Result<()> {
    // Input validation
    require!(agent != Pubkey::default(), GuardError::InvalidAgentPubkey);
    require!(max_spend_per_tx > 0, GuardError::ZeroAmount);
    require!(max_spend_per_day > 0, GuardError::ZeroAmount);
    require!(max_spend_per_day >= max_spend_per_tx, GuardError::InvalidLimits);
    require!(
        allowed_programs.len() <= VaultState::MAX_ALLOWED_PROGRAMS,
        GuardError::TooManyPrograms
    );

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;

    vault.owner = ctx.accounts.owner.key();
    vault.agent = agent;
    vault.max_spend_per_tx = max_spend_per_tx;
    vault.max_spend_per_day = max_spend_per_day;
    vault.spent_today = 0;
    vault.day_window_start = clock.unix_timestamp;
    vault.agent_expires_at = agent_expires_at;
    vault.allowed_programs = allowed_programs;
    vault.is_active = true;
    vault.bump = ctx.bumps.vault;
    vault._reserved = [0u8; 64];

    Ok(())
}
```

### Guarded Withdraw with Full Guard Logic

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

#[derive(Accounts)]
pub struct GuardedWithdraw<'info> {
    /// The agent requesting withdrawal -- must match vault.agent
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Destination ATA -- where the USDC goes
    #[account(mut)]
    pub destination_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<GuardedWithdraw>,
    amount: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    // === CHECKS ===

    // 1. Vault must be active
    require!(vault.is_active, GuardError::VaultPaused);

    // 2. Caller must be registered agent
    require!(
        ctx.accounts.agent.key() == vault.agent,
        GuardError::Unauthorized
    );

    // 3. Agent must not be expired
    if vault.agent_expires_at > 0 {
        require!(
            clock.unix_timestamp < vault.agent_expires_at,
            GuardError::AgentExpired
        );
    }

    // 4. Amount must be positive
    require!(amount > 0, GuardError::ZeroAmount);

    // 5. Per-tx limit
    require!(
        amount <= vault.max_spend_per_tx,
        GuardError::ExceedsPerTxLimit
    );

    // 6. Daily window reset check
    let seconds_elapsed = clock.unix_timestamp
        .checked_sub(vault.day_window_start)
        .ok_or(GuardError::ArithmeticOverflow)?;
    if seconds_elapsed >= 86_400 {
        vault.spent_today = 0;
        vault.day_window_start = clock.unix_timestamp;
    }

    // 7. Daily cap check
    let new_total = vault.spent_today
        .checked_add(amount)
        .ok_or(GuardError::ArithmeticOverflow)?;
    require!(
        new_total <= vault.max_spend_per_day,
        GuardError::ExceedsDailyCap
    );

    // 8. Program whitelist check (destination token account owner)
    if !vault.allowed_programs.is_empty() {
        require!(
            vault.allowed_programs.contains(
                &ctx.accounts.destination_token_account.owner
            ),
            GuardError::ProgramNotWhitelisted
        );
    }

    // === EFFECTS ===
    vault.spent_today = new_total;

    // === INTERACTIONS ===
    let owner_key = vault.owner;
    let seeds = &[b"vault".as_ref(), owner_key.as_ref(), &[vault.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.destination_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );

    token::transfer(cpi_ctx, amount)?;

    Ok(())
}
```

### Revoke Agent (Instant Kill Switch)

```rust
#[derive(Accounts)]
pub struct RevokeAgent<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ GuardError::Unauthorized,
    )]
    pub vault: Account<'info, VaultState>,
}

pub fn handler(ctx: Context<RevokeAgent>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.agent = Pubkey::default();
    vault.is_active = false;
    vault.agent_expires_at = 0;

    // Emit event for off-chain tracking
    emit!(AgentRevoked {
        vault: ctx.accounts.vault.key(),
        owner: ctx.accounts.owner.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct AgentRevoked {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub timestamp: i64,
}
```

### Proxy-Side Transaction Submission

```rust
// Source: solana-client + anchor-client standard pattern
// NOTE: Verify crate versions before implementation
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
    compute_budget::ComputeBudgetInstruction,
};

pub struct SolanaGuardClient {
    rpc: RpcClient,
    program_id: Pubkey,
    agent_keypair: Keypair,  // Ephemeral keypair held by proxy
}

impl SolanaGuardClient {
    pub fn new(rpc_url: &str, program_id: Pubkey, agent_keypair: Keypair) -> Self {
        let rpc = RpcClient::new_with_commitment(
            rpc_url.to_string(),
            CommitmentConfig::confirmed(),  // ~400ms confirmation
        );
        Self { rpc, program_id, agent_keypair }
    }

    pub async fn guarded_withdraw(
        &self,
        vault_owner: &Pubkey,
        amount: u64,
        destination: &Pubkey,
    ) -> Result<String, Box<dyn std::error::Error>> {
        // Derive vault PDA
        let (vault_pda, _bump) = Pubkey::find_program_address(
            &[b"vault", vault_owner.as_ref()],
            &self.program_id,
        );

        // Build instruction using anchor-client or manual serialization
        // (exact API depends on anchor-client version)

        let compute_budget_ix = ComputeBudgetInstruction::set_compute_unit_limit(400_000);
        let priority_fee_ix = ComputeBudgetInstruction::set_compute_unit_price(1_000);

        // ... build guarded_withdraw instruction ...

        let recent_blockhash = self.rpc.get_latest_blockhash().await?;
        let tx = Transaction::new_signed_with_payer(
            &[compute_budget_ix, priority_fee_ix, /* withdraw_ix */],
            Some(&self.agent_keypair.pubkey()),
            &[&self.agent_keypair],
            recent_blockhash,
        );

        let signature = self.rpc.send_and_confirm_transaction(&tx).await?;
        Ok(signature.to_string())
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cargo build-bpf` | `cargo build-sbf` | Solana 1.16+ (2023) | Anchor 0.29+ uses SBF toolchain, not BPF |
| `@project-serum/anchor` npm | `@coral-xyz/anchor` npm | Anchor 0.27+ (2023) | Old npm package is deprecated |
| Solana Labs validator | Anza/Agave validator fork | 2024 | SDK crate naming may change; verify |
| Anchor IDL v0 format | Anchor IDL v1 format | Anchor 0.30 (VERIFY) | Client must use matching IDL version |
| `solana-program` for programs | `anchor-lang` wrapping `solana-program` | Standard since 2022 | Direct `solana-program` use is discouraged for new projects |
| `init_if_needed` freely available | Behind feature gate | Anchor 0.26+ | Must explicitly enable in Cargo.toml features -- security concern |

**Deprecated/outdated:**
- `@project-serum/anchor`: Replaced by `@coral-xyz/anchor`
- `cargo build-bpf`: Replaced by `cargo build-sbf`
- Clockwork automation: Deprecated, team pivoted
- Gum Session Keys: Project status uncertain (LOW confidence) -- do not depend on it

## Security Considerations (Level 10)

### Account Validation Checklist

For every Anchor instruction, verify:

1. **Signer validation:** Is the correct party signing? (owner for admin ops, agent for withdrawals)
2. **PDA seed validation:** Do seeds match expected derivation? (prevents account substitution)
3. **Bump stored and reused:** Is bump stored in state and used for re-derivation?
4. **Mint validation:** Does `associated_token::mint = usdc_mint` prevent mint substitution?
5. **Authority validation:** Does `associated_token::authority = vault` prevent authority spoofing?
6. **Constraint checks:** Are all business rules enforced via `constraint =` or `require!()`?

### Reentrancy on Solana

Solana's runtime provides inherent reentrancy protection: within a single transaction, an account can only be borrowed mutably once. Cross-Program Invocation (CPI) cannot re-enter the calling program within the same instruction. However, a malicious program invoked via CPI could potentially manipulate shared accounts. For x402Guard, the only CPI target is the SPL Token program (trusted), so reentrancy is not a practical concern.

### Front-Running

Solana uses Gulf Stream (forward transactions to next leader) rather than a public mempool. Front-running is harder than on Ethereum but not impossible (validators can reorder within a slot). For x402Guard:
- All spend limits are checked at program level, not vulnerable to timing attacks
- Agent keypair is held by proxy (not broadcast publicly)
- No price-sensitive operations (pure transfers, not swaps)

Risk: LOW for x402Guard's use case.

### Fund Safety

- **Non-custodial guarantee:** Only the program can sign for the vault PDA. The proxy never has the vault authority.
- **Kill switch:** `revoke_agent` zeroes the agent pubkey in one slot (~400ms). After revocation, NO withdrawal is possible until owner re-registers an agent.
- **Pause vs Revoke:** Pause (`is_active = false`) is reversible. Revoke (`agent = default`) requires explicit re-registration. Close vault returns ALL funds to owner.
- **No admin keys:** The program has no upgrade authority backdoor (set upgrade authority to null after deployment for production).

### Overflow Protection

```rust
// Every arithmetic operation MUST use checked methods
let new_total = vault.spent_today
    .checked_add(amount)
    .ok_or(GuardError::ArithmeticOverflow)?;
```

Consistent with the project's existing policy (STATE.md: "Checked integer casts everywhere").

### Account Closure Attacks

When closing the vault, Anchor's `close = owner` constraint automatically:
1. Zeros the account discriminator (prevents re-use)
2. Transfers lamports to the specified account
3. Sets account data to zero

This prevents resurrection attacks where a closed PDA could be re-initialized with different data.

## Daily Spend Tracking: Window Reset vs Sliding Window

### Recommended: Simple Window Reset (for MVP)

**How it works:**
- `day_window_start` stores the timestamp when the current 24h window began
- On each `guarded_withdraw`, check if 86,400 seconds have elapsed since `day_window_start`
- If yes: reset `spent_today = 0` and `day_window_start = now`
- Then check if `spent_today + amount <= max_spend_per_day`

**Worst case:** Agent spends near the end of window 1, then again at the start of window 2 = 2x daily cap in ~1 second. For a $1000 daily cap, this means $2000 in a burst.

**Mitigation options (post-MVP):**
1. Use shorter windows (12h or 6h) to reduce burst risk
2. Add a per-hour cap as a secondary guardrail
3. Implement a simple sliding window by storing last N transaction timestamps on-chain (expensive but possible for small N)

### Alternative: Per-Slot or Per-Epoch Tracking

Solana has slots (~400ms) and epochs (~2 days). Neither maps well to "24h window." The Clock sysvar's `unix_timestamp` is the right tool.

## Proxy Integration Architecture

### Option A: anchor-client (Recommended if serde compatible)

The `anchor-client` crate provides typed instruction building using the program's IDL. This is the cleanest approach:

```rust
use anchor_client::{Client, Cluster, Program};

let client = Client::new(Cluster::Devnet, Rc::new(agent_keypair));
let program = client.program(program_id)?;

program
    .request()
    .accounts(GuardedWithdrawAccounts { /* ... */ })
    .args(x402_guard::instruction::GuardedWithdraw { amount })
    .send()?;
```

**Risk:** `anchor-client` depends on `solana-sdk` which may conflict with the proxy's `serde = "=1.0.219"` pin.

### Option B: Raw solana-client with Manual Instruction Serialization

If `anchor-client` causes dependency conflicts, use raw `solana-client`:

```rust
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::instruction::{AccountMeta, Instruction};

// Anchor discriminator for "guarded_withdraw"
let discriminator = anchor_lang::hash::hash(
    b"global:guarded_withdraw"
).to_bytes()[..8].to_vec();

let mut data = discriminator;
data.extend_from_slice(&amount.to_le_bytes()); // borsh-serialize args

let ix = Instruction {
    program_id,
    accounts: vec![
        AccountMeta::new_readonly(agent_pubkey, true),  // signer
        AccountMeta::new(vault_pda, false),
        AccountMeta::new(vault_token_account, false),
        AccountMeta::new(destination_token_account, false),
        AccountMeta::new_readonly(usdc_mint, false),
        AccountMeta::new_readonly(spl_token::ID, false),
    ],
    data,
};
```

**Risk:** Manual serialization must exactly match the Anchor IDL. Fragile to program changes.

### Option C: Separate Microservice (if serde conflict is unsolvable)

If `solana-sdk` truly conflicts with the proxy's dependencies, create a tiny separate Rust binary (`solana-submitter`) that:
1. Listens on a Unix socket or internal HTTP port
2. Receives structured JSON requests from the proxy
3. Builds and submits Solana transactions
4. Returns transaction signatures

This fully isolates dependency trees. It adds operational complexity but is architecturally clean.

**Recommendation order:** Try A first. If serde conflict, try B. If that also conflicts, use C.

## USDC on Solana

### Mint Addresses

| Network | Address | Confidence | Token Program |
|---------|---------|------------|---------------|
| Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | HIGH | SPL Token (original) |
| Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | LOW (verify) | SPL Token (original) |

### Devnet USDC Strategy

For devnet testing, there are two approaches:

1. **Use Circle's devnet USDC** (if still available): Request tokens from Circle's devnet faucet. Address must be verified.

2. **Create your own SPL Token mint** (recommended for testing reliability):
   ```bash
   # Create a new token mint (6 decimals like USDC)
   spl-token create-token --decimals 6 --url devnet
   # Create ATA for testing wallet
   spl-token create-account <MINT_ADDRESS> --url devnet
   # Mint test tokens
   spl-token mint <MINT_ADDRESS> 1000000 --url devnet
   ```

   Then use this mint address in the guard program's initialization. The guard program logic is mint-agnostic -- it just needs a valid SPL Token mint.

### Token-2022 Considerations

As of training data cutoff, USDC on Solana mainnet uses the original SPL Token program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`). Circle has been evaluating Token-2022 (Token Extensions). **Verify current status before mainnet deployment.**

For the guard program to be future-proof, accept `token_program` as a generic account and validate it's either SPL Token or Token-2022:

```rust
// Future-proof: support both token programs
pub token_program: Interface<'info, TokenInterface>,
```

This uses Anchor's `Interface` type which accepts either `Token` or `Token2022`.

## Compute Unit Costs (Estimates)

| Operation | Estimated CU | Notes |
|-----------|-------------|-------|
| `initialize_vault` | ~50,000 | PDA creation + ATA creation |
| `deposit` | ~30,000 | SPL Token transfer (user -> vault) |
| `guarded_withdraw` | ~80,000-120,000 | All guard checks + SPL Token transfer |
| `revoke_agent` | ~10,000 | Simple state update |
| `update_rules` | ~20,000 | State update, Vec serialization |
| `close_vault` | ~30,000 | Token transfer + PDA close |

Default compute limit is 200,000 CU per instruction. `guarded_withdraw` is well within limits even with 10-entry whitelist iteration. Set explicit limit to 400,000 CU from client side for safety margin.

**Transaction fees on devnet:** Essentially free (airdrop SOL via `solana airdrop`).
**Transaction fees on mainnet:** Base fee ~5,000 lamports (0.000005 SOL) + priority fee. At $200/SOL, that's ~$0.001 per transaction.

## Docker Build Strategy for Anchor

The project already builds Rust via Docker. Anchor programs need a separate Docker setup.

### Recommended Dockerfile

```dockerfile
# Anchor build environment
FROM rust:1.79-slim AS anchor-builder

# Install system dependencies
RUN apt-get update -qq && \
    apt-get install -y -qq \
    pkg-config libssl-dev libudev-dev \
    curl git nodejs npm \
    > /dev/null 2>&1

# Install Solana CLI
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)" && \
    echo 'export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"' >> /root/.bashrc
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor CLI
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked && \
    avm install 0.30.1 && \
    avm use 0.30.1

# VERIFY: All version numbers above must be confirmed against current releases
```

**IMPORTANT VERSION NOTE:** The Solana CLI install URL and version (`v1.18.26`) is from training data. The actual URL may have changed to `https://release.anza.xyz/` (Agave fork). Verify:
1. Current Solana/Agave CLI install instructions
2. Current AVM (Anchor Version Manager) install instructions
3. Latest stable Anchor version

### Build Commands

```bash
# From project root, using Docker
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "D:/x402Guard/solana:/app" -w /app \
  anchor-builder \
  bash -c "anchor build"

# Deploy to devnet
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "D:/x402Guard/solana:/app" \
  -v "$HOME/.config/solana:/root/.config/solana" \
  -w /app \
  anchor-builder \
  bash -c "anchor deploy --provider.cluster devnet"
```

## Open Questions

1. **Exact Anchor/Solana SDK versions**
   - What we know: Anchor 0.30.x was latest stable as of mid-2025. Solana SDK was 1.18.x.
   - What's unclear: Has Anchor 0.31 been released? Has Solana SDK 2.x become the standard? Has Anza/Agave rebranding affected crate names?
   - Recommendation: Run `cargo search anchor-lang` and `cargo search solana-sdk` in Docker to get current versions before writing Cargo.toml.

2. **serde version compatibility**
   - What we know: Project pins `serde = "=1.0.219"`. Solana SDK has its own serde requirements.
   - What's unclear: Will solana-sdk/anchor-client work with serde 1.0.219?
   - Recommendation: Test compatibility in Docker. If incompatible, use Option C (separate microservice).

3. **Devnet USDC mint address**
   - What we know: Historical address was `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
   - What's unclear: Is this still valid? Does it have devnet liquidity?
   - Recommendation: Create a custom SPL token for devnet testing. Don't depend on Circle's devnet USDC.

4. **Anchor Docker image availability**
   - What we know: `backpackapp/build` was a community Docker image for Anchor builds.
   - What's unclear: Is it maintained? Is there an official one now?
   - Recommendation: Build custom Docker image based on `rust:1.79-slim` with manual Solana CLI + AVM installation.

5. **Token-2022 migration status**
   - What we know: USDC mainnet was on original SPL Token as of training cutoff.
   - What's unclear: Has Circle migrated or announced migration?
   - Recommendation: Use `Interface<'info, TokenInterface>` in the program for forward compatibility. Test with original SPL Token for now.

## Sources

### Primary (HIGH confidence)
- Existing project research: `.planning/research/solana-guard.md` (authored 2026-02-24, training data based)
- Anchor framework patterns: Well-established since Anchor 0.24+, verified across multiple production programs (Squads, Drift, Marinade)
- SPL Token CPI pattern: Core Solana ecosystem pattern, documented extensively
- PDA vault pattern: Used by virtually all DeFi vaults on Solana

### Secondary (MEDIUM confidence)
- Anchor 0.30 specifics: Training data through May 2025. Syntax and features were stable by this point but verify changelog for any 0.30.x patch changes.
- Solana SDK version numbers: Were 1.18.x as of training cutoff. Anza/Agave transition may have changed versioning.
- Docker build approach: Standard for the project but Anchor-specific Docker setup needs verification.

### Tertiary (LOW confidence)
- USDC devnet mint address: Changes periodically. Must verify before use.
- serde compatibility with solana-sdk: Not tested. Flagged as risk.
- Token-2022 USDC status: Rapidly evolving. Must verify.
- Anchor CLI install URLs: May have changed with Anza branding.

## Metadata

**Confidence breakdown:**
- PDA vault pattern: HIGH - Canonical Solana pattern, used by all major DeFi protocols
- Anchor program structure: HIGH - Standard Anchor conventions, well-documented
- Guard rule logic (per-tx, daily, whitelist): HIGH - Standard program logic, no novel tech
- Security considerations: HIGH - Well-known Solana security patterns
- Version numbers (Anchor, Solana SDK): LOW - Training data stale, must verify before implementation
- Proxy integration (anchor-client): MEDIUM - Pattern is standard but serde compatibility unknown
- USDC devnet address: LOW - Historical, needs verification
- Docker build setup: MEDIUM - Custom setup needed, URLs may have changed

**Research date:** 2026-02-28
**Valid until:** 2026-03-07 (7 days -- fast-moving ecosystem, versions must be verified)
**Builds on:** `.planning/research/solana-guard.md` (2026-02-24, training-data-only research)

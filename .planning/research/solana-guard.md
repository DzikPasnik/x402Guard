# Solana Guard Program Research

**Project:** x402Guard.dev — Solana PDA Vault + Guard Program
**Researched:** 2026-02-24
**Overall Confidence:** MEDIUM
**Note on Sources:** WebSearch and WebFetch were unavailable in this environment. All findings are from
training data (cutoff August 2025). HIGH-confidence claims reflect well-established Solana/Anchor
patterns. MEDIUM/LOW items should be verified against current Anchor docs and the Solana cookbook
before implementation.

---

## Executive Summary

The Solana side of x402Guard needs a single Anchor program that acts as a non-custodial vault
with enforced guardrails. The standard pattern is:

1. A user-owned **VaultState** PDA that holds configuration (rules, agent pubkey, spending counters)
2. A **program-owned token account** (the vault ATA) that holds USDC
3. Program logic that enforces rules on every `guarded_withdraw` call

This pattern is well-established. Squads Protocol, SPL Governance (Realms), and numerous DeFi
vaults follow the same PDA-authority structure. The tricky parts for x402Guard are:
- Rolling daily spend window (requires on-chain clock and state)
- Contract whitelist enforcement (Solana has no "to contract" concept — destination is an account/program ID)
- Session keys (no native EIP-7702 analog — must implement in-program)

The recommended approach: Anchor 0.30+, SPL Token 2022-aware code, Clock sysvar for daily windows,
and a session-key PDA per agent that the program creates and the user can close.

---

## 1. PDA Vault Pattern

### Confidence: HIGH

This is the canonical Anchor pattern for program-controlled token custody.

### How It Works

A PDA (Program Derived Address) is an address owned by a program, not a private key. The program
can sign for that address using `invoke_signed` with the PDA seeds. This means:

- The user deposits USDC into a token account whose **authority is the PDA**
- Only the program can move those tokens (by signing with the PDA)
- The program only signs if the guardrail rules pass

### Key Accounts

```
VaultState PDA   seeds: ["vault", user_pubkey]
                 owner:  the guard program
                 data:   VaultState struct (rules, agent, counters)

VaultTokenAccount
                 mint:   USDC mint
                 owner:  VaultState PDA (the authority)
                 this is where USDC lives
```

### VaultState Account Structure

```rust
#[account]
pub struct VaultState {
    /// The user who owns this vault and can update rules or revoke agent
    pub owner: Pubkey,           // 32 bytes

    /// The agent pubkey allowed to trigger guarded withdrawals
    pub agent: Pubkey,           // 32 bytes

    /// Per-transaction USDC spend limit (in lamports of USDC, i.e. 6-decimal)
    pub max_spend_per_tx: u64,   // 8 bytes

    /// Daily USDC spend cap (rolling 24h window)
    pub max_spend_per_day: u64,  // 8 bytes

    /// How much has been spent in the current daily window
    pub spent_today: u64,        // 8 bytes

    /// Unix timestamp when the daily window started
    pub day_window_start: i64,   // 8 bytes

    /// Whitelisted destination program IDs (up to N entries)
    pub allowed_programs: Vec<Pubkey>, // 4 + 32*N bytes

    /// Whether the vault is active (user can pause it)
    pub is_active: bool,         // 1 byte

    /// Bump seed for deterministic PDA re-derivation
    pub bump: u8,                // 1 byte
}

impl VaultState {
    // Space calculation for account init
    // 8 (discriminator) + 32 + 32 + 8 + 8 + 8 + 8 + (4 + 32*10) + 1 + 1 = ~430
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + (4 + 32 * 10) + 1 + 1;
}
```

### PDA Derivation

```rust
// Canonical seeds pattern — deterministic per user
let (vault_pda, bump) = Pubkey::find_program_address(
    &[b"vault", user.key().as_ref()],
    program_id,
);
```

The bump is stored in `VaultState.bump` so it never needs to be recomputed off-chain.

### Token Account Ownership

USDC uses the SPL Token program. The vault's token account is a standard Associated Token Account
(ATA) whose authority is the VaultState PDA:

```
vault_token_account = get_associated_token_address(&vault_pda, &USDC_MINT)
```

Because `vault_pda` is a program-derived address owned by the guard program, only the guard program
can sign CPI calls that move tokens out of that account.

---

## 2. Anchor Program Instructions

### Confidence: HIGH (structure), MEDIUM (exact syntax — verify against Anchor 0.30 changelog)

### Recommended Instruction Set

```
initialize_vault   — user creates PDA vault + sets initial rules
deposit            — user transfers USDC into vault token account
guarded_withdraw   — agent requests withdrawal; program enforces rules
update_rules       — owner updates spend limits / whitelist
pause_vault        — owner toggles is_active (instant halt)
revoke_agent       — owner replaces agent pubkey with zero / closes session key PDA
close_vault        — owner reclaims all USDC + closes PDA (full exit)
```

### `initialize_vault` Instruction

```rust
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The vault state PDA — created here, funded by owner for rent
    #[account(
        init,
        payer = owner,
        space = VaultState::SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// The vault's USDC token account — authority is the vault PDA
    /// Use init_if_needed or initialize separately in same tx
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

pub fn initialize_vault(
    ctx: Context<InitializeVault>,
    agent: Pubkey,
    max_spend_per_tx: u64,
    max_spend_per_day: u64,
    allowed_programs: Vec<Pubkey>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.owner = ctx.accounts.owner.key();
    vault.agent = agent;
    vault.max_spend_per_tx = max_spend_per_tx;
    vault.max_spend_per_day = max_spend_per_day;
    vault.spent_today = 0;
    vault.day_window_start = clock.unix_timestamp;
    vault.allowed_programs = allowed_programs;
    vault.is_active = true;
    vault.bump = ctx.bumps.vault;

    Ok(())
}
```

### `deposit` Instruction

Deposit is simple — the user transfers from their own token account into the vault token account.
This uses standard SPL Token CPI. The program does not need to sign this.

```rust
#[derive(Accounts)]
pub struct Deposit<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        constraint = vault.owner == owner.key() @ GuardError::Unauthorized,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, GuardError::ZeroAmount);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );

    token::transfer(cpi_ctx, amount)?;
    Ok(())
}
```

### `guarded_withdraw` Instruction

This is the core of the guard program. The agent signs the transaction, but the program enforces
all rules before allowing the SPL Token CPI to execute.

```rust
#[derive(Accounts)]
pub struct GuardedWithdraw<'info> {
    /// The agent — must match vault.agent
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

    /// Destination token account (agent's ATA or target service ATA)
    #[account(mut)]
    pub destination_token_account: Account<'info, TokenAccount>,

    /// The destination program — must be in vault.allowed_programs
    /// CHECK: Validated by guard logic below, not Anchor constraint
    pub destination_program: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn guarded_withdraw(
    ctx: Context<GuardedWithdraw>,
    amount: u64,
    destination_program_id: Pubkey,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    // 1. Vault must be active
    require!(vault.is_active, GuardError::VaultPaused);

    // 2. Caller must be the registered agent
    require!(
        ctx.accounts.agent.key() == vault.agent,
        GuardError::Unauthorized
    );

    // 3. Per-tx limit
    require!(
        amount <= vault.max_spend_per_tx,
        GuardError::ExceedsPerTxLimit
    );

    // 4. Daily window reset (rolling 24h)
    let seconds_elapsed = clock.unix_timestamp - vault.day_window_start;
    if seconds_elapsed >= 86_400 {
        vault.spent_today = 0;
        vault.day_window_start = clock.unix_timestamp;
    }

    // 5. Daily cap check
    let new_total = vault.spent_today.checked_add(amount)
        .ok_or(GuardError::ArithmeticOverflow)?;
    require!(
        new_total <= vault.max_spend_per_day,
        GuardError::ExceedsDailyCap
    );

    // 6. Contract/program whitelist check
    require!(
        vault.allowed_programs.contains(&destination_program_id),
        GuardError::ProgramNotWhitelisted
    );

    // 7. Execute the SPL Token transfer — PDA signs via invoke_signed
    let owner_key = vault.owner.key();
    let seeds = &[b"vault", owner_key.as_ref(), &[vault.bump]];
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

    // 8. Update state after successful transfer (CEI pattern: effects after checks)
    vault.spent_today = new_total;

    Ok(())
}
```

**CRITICAL NOTE:** The daily window is "reset-on-first-tx-after-24h", not a strict calendar day.
This is the standard on-chain approach. A true sliding window would require storing per-tx history,
which is expensive on Solana. The simple window is appropriate for MVP.

---

## 3. SPL Token Integration

### Confidence: HIGH

### USDC Mint Addresses

```
Mainnet:  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
Devnet:   4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU  (Circle's devnet USDC)
```

**Verify these before deployment.** The mainnet address is well-known but devnet addresses change.
Check https://developers.circle.com/stablecoins/docs/usdc-on-solana for current devnet address.

### SPL Token vs Token-2022

USDC on Solana mainnet currently uses the original SPL Token program:
```
TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
```

Token-2022 (Token Extensions program) is a newer program that supports additional features like
transfer fees, confidential transfers, and interest-bearing tokens. USDC mainnet does NOT use
Token-2022 as of August 2025. **Verify current status** — Circle has been evaluating Token-2022.

**Recommendation:** Write the program to support both programs via feature flag or by passing
`token_program` as an account (Anchor handles this via constraint checks on program account).

### ATA vs Raw Token Account

Use Associated Token Accounts (ATAs) everywhere:
- Deterministic addresses (`get_associated_token_address(owner, mint)`)
- Standard in ecosystem tooling
- Easier for clients to derive without RPC calls

The vault's token account ATA is derived as:
```
get_associated_token_address(&vault_pda, &USDC_MINT)
```

### Token Program CPI Pattern

All token operations (transfer, close_account) go through CPI to the Token program. The key is
that the `authority` field of the `Transfer` struct must be the PDA, and the CPI must use
`new_with_signer` with the PDA's seeds.

---

## 4. Session Keys on Solana

### Confidence: MEDIUM

Solana has no native equivalent of EIP-7702. The Solana runtime does not support account-level
code delegation. Session key patterns are implemented entirely in program logic.

### Option A: Agent Pubkey in VaultState (Simplest — Recommended for MVP)

Store a single `agent: Pubkey` in VaultState. The agent is a keypair held by the x402Guard proxy
service (off-chain). To "create a session key", the user calls `initialize_vault` (or
`update_rules`) with the proxy's ephemeral pubkey. To revoke, the user calls `revoke_agent`.

**Tradeoffs:**
- Simple: one PDA, one agent slot
- The proxy service holds the agent keypair in memory / HSM
- No on-chain time expiry (must implement off-chain, or add `expires_at: i64` to VaultState)
- Cannot support multiple concurrent agents without an array

**Recommended enhancement for MVP:** Add `agent_expires_at: i64` to VaultState. Check in
`guarded_withdraw` that `clock.unix_timestamp < vault.agent_expires_at`.

### Option B: SessionKey PDA (More Flexible)

Create a separate PDA per session key:

```rust
seeds = [b"session", vault_pda.as_ref(), session_id.as_ref()]
```

The `SessionKey` account stores:
- `agent: Pubkey`
- `expires_at: i64`
- `max_spend_session: u64` (session-level cap separate from daily cap)
- `spent_session: u64`
- `is_revoked: bool`

`guarded_withdraw` takes a `session_key` account and validates it. Revocation closes the PDA
(closing an account reclaims rent — strong incentive to revoke).

**Tradeoffs:**
- More granular: multiple concurrent sessions per vault
- Each session creation/revocation is a separate transaction
- More complex program and client code
- Better fits x402Guard's multi-agent model

**Recommendation:** Implement Option A for MVP, then extend to Option B in a later phase when
multi-agent is needed.

### Option C: Gum Session Keys

Gum Protocol built a session key standard for Solana gaming. It creates ephemeral wallets that
can sign on behalf of a user for specific programs. Their design:

```
SessionToken PDA:
  - targetProgram: Pubkey
  - sessionSigner: Pubkey (ephemeral key)
  - validUntil: i64
  - sessionKey: Pubkey (the token address)
```

Source: https://github.com/gumhq/gum-program-library (verify repo status — MEDIUM confidence)

**Assessment for x402Guard:** Gum's design is for gaming (short-lived, narrow-scope sessions).
It does not include spend caps or multi-program whitelists. Building x402Guard's own session key
PDA (Option B) is more appropriate.

### Option D: Clockwork / Automation Networks

Clockwork was a Solana thread automation protocol. As of early 2025, Clockwork was deprecated and
the team pivoted. Do not use Clockwork for session key implementation.

**VERIFY:** Check if any successor automation protocol exists on Solana. This is LOW confidence
given rapid ecosystem changes.

### Off-Chain Session Key Pattern (What x402Guard Actually Needs)

For x402Guard, the "session key" concept is partially off-chain:

1. x402Guard proxy holds an ephemeral Solana keypair per agent (off-chain in memory/Supabase)
2. That keypair's public key is registered in VaultState as `agent`
3. When the proxy intercepts an x402 payment, it signs the `guarded_withdraw` transaction with
   the ephemeral keypair
4. The Solana program enforces the on-chain rules (limits, whitelist, expiry)
5. To "revoke", the user calls `revoke_agent` which zeroes out `vault.agent`

This means the Solana program does NOT need to implement complex session key logic — the x402Guard
proxy handles the session key lifecycle, and the program only enforces the guardrails.

---

## 5. Revocation

### Confidence: HIGH

### Instant Revocation Pattern

The fastest revocation on Solana is a single instruction that overwrites `vault.agent` with
`Pubkey::default()` (all zeros). After this, no agent keypair can sign a valid `guarded_withdraw`.

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

pub fn revoke_agent(ctx: Context<RevokeAgent>) -> Result<()> {
    ctx.accounts.vault.agent = Pubkey::default();
    ctx.accounts.vault.is_active = false; // Belt and suspenders
    Ok(())
}
```

### Latency: One Solana Confirmation (~400ms on mainnet)

Revocation takes effect as soon as one slot confirms. Solana's ~400ms slot time means revocation
is near-instant compared to EVM chains (~12s on Ethereum). This is a significant advantage.

### Pause vs Full Revoke

For the dashboard "one-click revoke" feature, expose two operations:

1. **Pause** (`pause_vault`): Sets `vault.is_active = false`. Agent pubkey remains registered but
   no withdrawals allowed. User can resume by calling `unpause_vault`.

2. **Revoke Agent** (`revoke_agent`): Zeroes `vault.agent`. Agent must be re-registered to resume.
   This is the "nuclear option".

3. **Close Vault** (`close_vault`): Closes the PDA, returns all USDC to owner, reclaims rent.
   Permanent — vault must be re-initialized to use again.

### Closing PDAs for Revocation

For the session key PDA approach (Option B), closing the PDA itself is the revocation:

```rust
#[account(
    mut,
    close = owner,  // Anchor closes account, returns rent lamports to owner
    seeds = [b"session", vault.key().as_ref(), session_id.as_ref()],
    bump = session_key.bump,
)]
pub session_key: Account<'info, SessionKey>,
```

`close = owner` in the Anchor constraint automatically zeroes the account discriminator and
transfers lamports to `owner`. After closing, the account cannot be deserialized — effectively
revoked.

---

## 6. Existing Examples and Prior Art

### Confidence: MEDIUM (specific versions/states may have changed)

### Squads Protocol (Multi-sig)

Squads is the leading multi-sig on Solana. It uses a PDA vault pattern where the Squad PDA is
the authority over member token accounts. Spending requires M-of-N member signatures.

- Repo: https://github.com/Squads-Protocol/squads-mpl (v3) and v4
- Relevant: PDA authority over token accounts, permission checking
- Not relevant: Multi-sig voting mechanism (x402Guard is single-user + single-agent)

**What to copy:** Squads' approach to PDA account validation and CPI token transfers.
**Squads v4 uses Anchor 0.29/0.30** — matches the version range to target.

### SPL Governance (Realms)

SPL Governance is the on-chain governance framework for Solana DAOs. The Governance PDA controls
a Native Treasury account that holds SOL and tokens.

- Repo: https://github.com/solana-labs/solana-program-library/tree/master/governance
- Relevant: Program-controlled treasury, time-locked actions, permission delegation
- Not directly usable: Too complex and governance-focused

### Marinade Finance / Staking Vaults

Marinade's liquid staking vault uses the PDA-authority-over-token-account pattern at scale.
Useful for understanding production-grade PDA vault design with large TVL.

### Drift Protocol (Perpetuals)

Drift uses a user account PDA that stores balances and enforces margin/risk rules. The
`guarded_withdraw` pattern maps closely to Drift's `withdraw` instruction that checks:
- Sufficient balance
- No liquidation risk
- Proper authority

Source: https://github.com/drift-labs/protocol-v2

**What to study:** How Drift handles per-instruction checks efficiently without storing too much
state on-chain.

### Serum/OpenBook DEX Vaults

OpenBook (formerly Serum) uses vault authority PDAs for open order accounts. The program signs
settlements on behalf of users.

### Armada / Guard-Oriented Programs

There is no established "guard program" archetype directly matching x402Guard's model of
"agent-controlled withdrawals with user-defined limits." The closest analogs are:

- Token approvals (ERC-20 style): SPL Token's `approve()` lets users delegate spending to another
  pubkey up to an amount. However, this does not enforce daily caps or program whitelists.
  **Limitation:** SPL Token approval is not sufficient for x402Guard — it only enforces a total
  allowance, not per-tx or per-day limits. Use the PDA vault instead.

- **Recommendation:** x402Guard's guard program is novel in the Solana ecosystem. The PDA vault
  pattern is standard; the guardrail logic is custom. This is a competitive advantage.

---

## 7. Full Program Structure

### Confidence: MEDIUM (Anchor 0.30 syntax — verify IDL generation changes)

### Program Layout

```
programs/
  x402-guard/
    src/
      lib.rs              — program entrypoint, instruction dispatch
      state/
        mod.rs
        vault.rs          — VaultState account struct
        session_key.rs    — SessionKey account struct (Phase 2)
      instructions/
        mod.rs
        initialize_vault.rs
        deposit.rs
        guarded_withdraw.rs
        update_rules.rs
        pause_vault.rs
        revoke_agent.rs
        close_vault.rs
      errors.rs           — GuardError enum
      constants.rs        — USDC_MINT, MAX_ALLOWED_PROGRAMS, etc.
```

### lib.rs Entry Point

```rust
use anchor_lang::prelude::*;

mod state;
mod instructions;
mod errors;
mod constants;

use instructions::*;

declare_id!("REPLACE_WITH_ACTUAL_PROGRAM_ID");

#[program]
pub mod x402_guard {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVaultCtx>,
        agent: Pubkey,
        max_spend_per_tx: u64,
        max_spend_per_day: u64,
        allowed_programs: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::initialize_vault::handler(
            ctx, agent, max_spend_per_tx, max_spend_per_day, allowed_programs
        )
    }

    pub fn deposit(ctx: Context<DepositCtx>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn guarded_withdraw(
        ctx: Context<GuardedWithdrawCtx>,
        amount: u64,
        destination_program_id: Pubkey,
    ) -> Result<()> {
        instructions::guarded_withdraw::handler(ctx, amount, destination_program_id)
    }

    pub fn update_rules(
        ctx: Context<UpdateRulesCtx>,
        new_max_per_tx: Option<u64>,
        new_max_per_day: Option<u64>,
        new_allowed_programs: Option<Vec<Pubkey>>,
        new_agent: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_rules::handler(
            ctx, new_max_per_tx, new_max_per_day, new_allowed_programs, new_agent
        )
    }

    pub fn pause_vault(ctx: Context<PauseVaultCtx>) -> Result<()> {
        instructions::pause_vault::handler(ctx)
    }

    pub fn revoke_agent(ctx: Context<RevokeAgentCtx>) -> Result<()> {
        instructions::revoke_agent::handler(ctx)
    }

    pub fn close_vault(ctx: Context<CloseVaultCtx>) -> Result<()> {
        instructions::close_vault::handler(ctx)
    }
}
```

### errors.rs

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Caller is not the registered agent")]
    Unauthorized,

    #[msg("Vault is paused by owner")]
    VaultPaused,

    #[msg("Amount exceeds per-transaction spend limit")]
    ExceedsPerTxLimit,

    #[msg("Amount would exceed daily spend cap")]
    ExceedsDailyCap,

    #[msg("Destination program is not whitelisted")]
    ProgramNotWhitelisted,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Too many programs in whitelist")]
    TooManyPrograms,

    #[msg("Agent pubkey cannot be the zero address")]
    InvalidAgentPubkey,
}
```

### constants.rs

```rust
pub const USDC_MINT_MAINNET: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const USDC_MINT_DEVNET: &str  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/// Maximum number of whitelisted programs per vault
pub const MAX_ALLOWED_PROGRAMS: usize = 10;

/// Daily window duration in seconds
pub const DAY_SECONDS: i64 = 86_400;
```

---

## 8. Checks-Effects-Interactions (CEI) on Solana

### Confidence: HIGH

Solana programs are not vulnerable to reentrancy in the same way as EVM programs (Solana's
execution model serializes access to account data within a transaction). However, the CEI pattern
is still best practice:

1. **Checks** — all require!() / constraint checks first
2. **Effects** — update state (e.g., vault.spent_today)
3. **Interactions** — CPI to token program last

The code examples above already follow this order.

**One Solana-specific concern:** If the CPI call to the Token program fails (e.g., insufficient
balance), the entire transaction reverts. State updates made before the CPI will also revert.
This means you can safely update `vault.spent_today` before the CPI — it will revert on failure.
However, the convention is to update state after the CPI for clarity.

---

## 9. Program-Side Whitelist: "Contracts" on Solana

### Confidence: HIGH (conceptual), MEDIUM (implementation nuance)

Solana does not have the concept of "calling a contract" in the same way as EVM. On Solana,
a transaction specifies:
- Which accounts are read/written
- Which programs are invoked

For x402Guard, the "contract whitelist" translates to: **destination program IDs that the agent
is allowed to invoke on behalf of the vault.**

However, `guarded_withdraw` itself only transfers USDC from the vault to a destination token
account. The agent then separately invokes the destination program. The guard program cannot
fully prevent the agent from calling arbitrary programs with the transferred USDC.

### Two Possible Interpretations

**Interpretation A: Whitelist destination token account owner (simpler)**
The guard program checks that `destination_token_account.owner` (the program owning the ATA)
is in the whitelist. This ensures USDC goes to a token account owned by an allowed program.

**Interpretation B: Composite instruction (more restrictive)**
The `guarded_withdraw` instruction includes a CPI to the destination program directly, making
the guard a middleware. This is complex and constrains the protocol.

**Recommendation for x402Guard:** Use Interpretation A. Check that the destination ATA is owned
by a whitelisted program. This covers the primary x402 payment flow where the agent pays a
service by sending USDC to that service's receiving account.

```rust
// In guarded_withdraw, after whitelist check:
let destination_owner = ctx.accounts.destination_token_account.owner;
require!(
    vault.allowed_programs.contains(&destination_owner),
    GuardError::ProgramNotWhitelisted
);
```

---

## 10. Rust Client Integration (x402Guard Proxy)

### Confidence: MEDIUM

The x402Guard Rust proxy needs a Solana client to:
1. Generate ephemeral keypairs for agents
2. Submit `guarded_withdraw` transactions when intercepting x402 payments
3. Monitor vault balances and spending counters (read-only RPC calls)

### Recommended Crate

Use `solana-client` + `anchor-client` for the Rust proxy.

```toml
# In proxy/Cargo.toml — add Solana support
[dependencies]
solana-client = "1.18"     # or latest stable — VERIFY version
solana-sdk = "1.18"
anchor-client = "0.30"     # matches program Anchor version
```

**IMPORTANT:** Solana SDK versions must match the validator version you target. As of August 2025,
Solana mainnet was on ~1.18.x. **Verify current mainnet version before pinning.**

### Connection Pool

The proxy should maintain a persistent `RpcClient` connection (or use `nonblocking::RpcClient`
for async):

```rust
use solana_client::nonblocking::rpc_client::RpcClient;

let rpc = RpcClient::new_with_commitment(
    rpc_url.to_string(),
    CommitmentConfig::confirmed(),
);
```

Use `CommitmentConfig::confirmed()` for withdrawal transactions (1 confirmation, ~400ms).
Use `CommitmentConfig::finalized()` for deposit detection (32 confirmations, ~12.8s).

---

## 11. Testing Strategy for Anchor Program

### Confidence: HIGH

### Unit Tests (Rust)

Anchor programs can be unit tested in Rust using `anchor-lang`'s test utilities. Create a
`tests/` directory inside the program:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;

    #[test]
    fn test_daily_window_reset() {
        // Test that spent_today resets when 24h elapsed
    }

    #[test]
    fn test_per_tx_limit_enforced() {
        // Test that amounts exceeding max_spend_per_tx fail
    }
}
```

### Integration Tests (TypeScript/Anchor Test)

Anchor's standard testing flow uses Mocha + Chai with `@coral-xyz/anchor`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { X402Guard } from "../target/types/x402_guard";

describe("x402-guard", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.X402Guard as Program<X402Guard>;

  it("initializes vault", async () => {
    // ...
  });

  it("rejects withdrawal above per-tx limit", async () => {
    // ...
  });

  it("enforces daily cap", async () => {
    // ...
  });

  it("rejects non-whitelisted program", async () => {
    // ...
  });

  it("revoke zeroes agent pubkey", async () => {
    // ...
  });
});
```

Use `anchor localnet` / `solana-test-validator` for local testing.

---

## 12. Security Considerations

### Confidence: HIGH

### Account Validation is Critical

Every account passed to an Anchor instruction must be validated. Use Anchor constraints aggressively:

```rust
#[account(
    mut,
    seeds = [b"vault", owner.key().as_ref()],
    bump = vault.bump,
    constraint = vault.owner == owner.key() @ GuardError::Unauthorized,
    constraint = vault.is_active @ GuardError::VaultPaused,
)]
```

Failure to validate can lead to:
- **Privilege escalation:** Passing a different vault PDA that the attacker controls
- **Signer bypass:** Claiming a signer is valid when it's not
- **Account substitution:** Passing a malicious token account as the destination

### Owner Check on Token Accounts

Always verify that token accounts have the expected mint:

```rust
#[account(
    associated_token::mint = usdc_mint,
    associated_token::authority = vault,
)]
pub vault_token_account: Account<'info, TokenAccount>,
```

Anchor's `associated_token::mint` constraint prevents mint substitution attacks.

### Integer Overflow

Use `checked_add`, `checked_sub`, `checked_mul` for all arithmetic. Anchor provides `#[error_code]`
for custom errors. Never use unchecked arithmetic in financial programs.

### Front-Running Considerations

Solana's mempool is less exposed than Ethereum (transactions go directly to leader via Gulf Stream).
However, a sophisticated validator could theoretically reorder transactions. For x402Guard, this
risk is low given:
- Transactions are user-signed with nonce-equivalent `recent_blockhash`
- Spend limits are enforced at program level, not race-condition-prone off-chain

### Account Closure Attacks

When closing a SessionKey PDA, ensure the lamports are returned and the discriminator is zeroed
(Anchor's `close = owner` handles this automatically). If not zeroed, a closed account could be
re-initialized to an unexpected state.

---

## 13. Deployment and Toolchain

### Confidence: MEDIUM (verify versions)

### Recommended Toolchain

```
Anchor CLI:    0.30.x (latest stable as of mid-2025 — VERIFY)
Solana CLI:    1.18.x (must match target validator — VERIFY)
Rust:          1.79+ (Anchor 0.30 requirement — VERIFY)
Node:          18+ (for Anchor tests)
```

### Program Deployment Flow

```bash
# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify IDL
anchor idl init --filepath target/idl/x402_guard.json <PROGRAM_ID> \
  --provider.cluster devnet

# Test
anchor test --provider.cluster localnet
```

### Anchor.toml Structure

```toml
[features]
seeds = false
skip-lint = false

[programs.localnet]
x402_guard = "REPLACE_WITH_PROGRAM_ID"

[programs.devnet]
x402_guard = "REPLACE_WITH_DEVNET_PROGRAM_ID"

[programs.mainnet]
x402_guard = "REPLACE_WITH_MAINNET_PROGRAM_ID"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

---

## 14. Pitfalls and Warnings

### Pitfall 1: Account Size Limits

**Problem:** Solana accounts have a maximum size of 10 MB, but realistically accounts should be
kept small. The `allowed_programs: Vec<Pubkey>` field grows with the whitelist.

**Mitigation:** Cap at `MAX_ALLOWED_PROGRAMS = 10` and enforce in the program. If more programs
are needed, consider a separate `WhitelistEntry` PDA per program (more gas but no size limit).

### Pitfall 2: Rent-Exempt Balance

**Problem:** Every Solana account must hold enough SOL to be rent-exempt. When calling `init` on
a PDA, the payer must have enough SOL. Developers often forget to account for this in tests.

**Mitigation:** In Anchor, `init` accounts automatically calculate the minimum rent-exempt balance.
Document this in setup instructions for users.

### Pitfall 3: Clock Sysvar Manipulation

**Problem:** `Clock::get()?.unix_timestamp` can be up to 1-2 seconds stale on mainnet during
periods of slow leader progression. For daily windows this is inconsequential, but worth knowing.

**Mitigation:** For x402Guard's daily spend cap, a few seconds of imprecision is acceptable.
Do not use `Clock` for high-precision timing requirements.

### Pitfall 4: Anchor Version Incompatibility

**Problem:** Anchor 0.28 → 0.29 → 0.30 each had breaking changes in account validation macros,
IDL format, and the `init_if_needed` feature gate. Client-side `@coral-xyz/anchor` must match
the on-chain IDL version.

**Mitigation:** Pin both `anchor-lang` (program) and `@coral-xyz/anchor` (client) to the same
minor version. Use the same Anchor CLI version.

### Pitfall 5: Missing `realloc` for Dynamic Vec

**Problem:** If `allowed_programs` grows (via `update_rules`), the account needs more space.
Anchor supports `realloc` for this:

```rust
#[account(
    mut,
    realloc = VaultState::space_for(new_count),
    realloc::payer = owner,
    realloc::zero = false,
    seeds = [...],
    bump = vault.bump,
)]
```

**Mitigation:** Either (a) pre-allocate maximum space upfront, or (b) implement `realloc` in
`update_rules`. Option (a) is simpler for MVP.

### Pitfall 6: CPI Depth Limit

**Problem:** Solana limits CPI call depth to 4 levels. If x402Guard is invoked from another
program (e.g., a DEX router), and then CPIs to the token program, that's already depth 2-3.

**Mitigation:** Keep x402Guard as a direct entry point (not called via CPI). The x402Guard proxy
submits transactions directly, not via another program.

### Pitfall 7: Missing Compute Budget

**Problem:** Complex programs with Vec iteration can hit the 200,000 compute unit default.

**Mitigation:** Call `ComputeBudgetInstruction::set_compute_unit_limit(400_000)` and
`ComputeBudgetInstruction::set_compute_unit_price(1_000)` in the transaction from the proxy client.

---

## 15. Recommended Implementation Order

Based on all research findings:

### Phase 1 — Core Vault (MVP)
1. `initialize_vault` with `VaultState` PDA + vault ATA
2. `deposit` SPL Token CPI
3. `guarded_withdraw` with per-tx limit + daily cap + program whitelist
4. `revoke_agent` (instant revocation)
5. Anchor tests on localnet

### Phase 2 — Session Keys + Management
6. Add `agent_expires_at` to VaultState (simple expiry)
7. `update_rules` instruction
8. `pause_vault` / `unpause_vault`
9. `close_vault` for full exit

### Phase 3 — Advanced (Post-MVP)
10. `SessionKey` PDA for multi-agent support (Option B above)
11. Token-2022 compatibility check
12. On-chain audit event emission (Anchor events)

---

## Summary Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| PDA vault pattern | HIGH | Well-established Anchor pattern, used by Squads, Drift, dozens of others |
| SPL Token CPI | HIGH | Core Anchor feature, documented extensively |
| Guard rule logic | HIGH | Standard program logic, no novel tech |
| USDC addresses | MEDIUM | Mainnet well-known, devnet changes periodically |
| Session keys | MEDIUM | Options well-understood; Gum protocol status needs verification |
| Anchor 0.30 syntax | MEDIUM | Training data through Aug 2025; verify changelog for 0.30 specifics |
| Solana SDK versions | MEDIUM | Version pinning needs verification against current mainnet |
| Clockwork / automation | LOW | Protocol deprecated — avoid |
| Gum Session Keys status | LOW | Project status uncertain — verify before adopting |

---

## Gaps to Verify Before Implementation

1. **Anchor 0.30 breaking changes:** Check the official Anchor changelog at
   https://www.anchor-lang.com/release-notes — particularly account constraint syntax changes

2. **USDC devnet address:** Verify current Circle devnet USDC mint at
   https://developers.circle.com/stablecoins/docs/usdc-on-solana

3. **Token-2022 USDC:** Check if Circle has migrated or plans to migrate mainnet USDC to
   Token-2022 extensions

4. **Solana mainnet validator version:** Verify current stable version at
   https://github.com/solana-labs/solana/releases to pin SDK correctly

5. **Gum Session Keys:** Check https://github.com/gumhq/gum-program-library for current
   maintenance status and whether the design is compatible with non-gaming use cases

6. **`@solana/web3.js` v2 vs v1:** The JS client library had a major v2 release with breaking API
   changes. Confirm which version Anchor 0.30 client tooling uses by default

---

## Sources

All findings are from training data (model cutoff August 2025). No live web access was available.

**Official documentation to verify against:**
- https://www.anchor-lang.com/docs (Anchor docs)
- https://spl.solana.com/token (SPL Token docs)
- https://docs.solana.com (Solana developer docs)
- https://www.anchor-lang.com/release-notes (Anchor changelog)
- https://developers.circle.com/stablecoins/docs/usdc-on-solana (USDC addresses)

**Reference programs:**
- https://github.com/Squads-Protocol/squads-mpl (PDA vault + authority pattern)
- https://github.com/drift-labs/protocol-v2 (per-instruction rule enforcement)
- https://github.com/solana-labs/solana-program-library/tree/master/governance (SPL Governance treasury)
- https://github.com/gumhq/gum-program-library (session key pattern — verify status)

*Research authored: 2026-02-24*

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

// Program ID placeholder — replace with actual keypair-derived ID after `anchor keys list`
declare_id!("CCiocBgtgKu4x2JfiRgKaYTkt4HVGonEmperieZ3VXfj");

/// x402-guard: On-chain PDA vault guard for Solana USDC.
///
/// Enforces per-transaction limits, daily spend caps, program whitelists,
/// agent authorization, expiration, and one-click revocation.
///
/// All guardrails are checked fail-closed before any token transfer.
/// The program never holds custody — the PDA vault is owned by the user.
#[program]
pub mod x402_guard {
    use super::*;

    /// Initialize a new PDA vault with configurable guardrails.
    ///
    /// Creates the vault PDA and its associated USDC token account.
    /// Owner pays for account creation. Agent is authorized for withdrawals.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        params: InitializeVaultParams,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, params)
    }

    /// Deposit USDC into the vault.
    ///
    /// Anyone can deposit — not restricted to the owner.
    /// Funds are held in the vault's associated token account.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Execute a guarded withdrawal from the vault.
    ///
    /// Agent-only. All guardrails enforced fail-closed:
    /// active status, agent match, expiry, per-tx limit, daily cap, whitelist.
    pub fn guarded_withdraw(ctx: Context<GuardedWithdraw>, amount: u64) -> Result<()> {
        instructions::guarded_withdraw::handler(ctx, amount)
    }

    /// Update vault guardrail rules. Owner-only.
    ///
    /// Optional fields — only provided values are updated.
    /// Validates resulting state invariants (daily >= per-tx, etc.).
    pub fn update_rules(ctx: Context<UpdateRules>, params: UpdateRulesParams) -> Result<()> {
        instructions::update_rules::handler(ctx, params)
    }

    /// Revoke agent access. Owner-only kill switch.
    ///
    /// Zeros agent pubkey, pauses vault, clears expiry.
    /// No withdrawals possible after revocation until re-enabled.
    pub fn revoke_agent(ctx: Context<RevokeAgent>) -> Result<()> {
        instructions::revoke_agent::handler(ctx)
    }

    /// Close the vault and return all funds to the owner.
    ///
    /// Transfers remaining USDC to owner's ATA, closes vault ATA,
    /// and closes vault PDA (Anchor zeros discriminator).
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
        instructions::close_vault::handler(ctx)
    }
}

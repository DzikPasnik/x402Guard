use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{SECONDS_PER_DAY, USDC_MINT_DEVNET, USDC_MINT_MAINNET, VAULT_SEED};
use crate::errors::GuardError;
use crate::state::VaultState;

/// Accounts required for the `guarded_withdraw` instruction.
///
/// Only the authorized agent can invoke this. All guardrails are enforced.
#[derive(Accounts)]
pub struct GuardedWithdraw<'info> {
    /// Agent signer — must match vault.agent.
    pub agent: Signer<'info>,

    /// Vault PDA — mutable because spent_today and day_window_start may update.
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// Vault's USDC token account — source of withdrawal.
    #[account(
        mut,
        constraint = vault_token_account.mint == usdc_mint.key(),
        constraint = vault_token_account.owner == vault.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Destination USDC token account — where funds are sent.
    #[account(
        mut,
        constraint = destination_token_account.mint == usdc_mint.key(),
    )]
    pub destination_token_account: Account<'info, TokenAccount>,

    /// USDC mint — validated against known USDC mint addresses below.
    /// SECURITY [CRITICAL-5]: Also validated by token account constraints.
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

/// Event emitted on successful withdrawal for off-chain audit.
#[event]
pub struct WithdrawExecuted {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub spent_today_after: u64,
    pub timestamp: i64,
}

/// Execute a guarded withdrawal from the vault.
///
/// All checks are fail-closed: every guardrail must pass before
/// any state mutation or token transfer occurs.
///
/// Guardrails enforced:
/// 1. Vault is active (not paused)
/// 2. Signer matches vault.agent
/// 3. Agent not expired
/// 4. Amount > 0
/// 5. Amount <= max_spend_per_tx
/// 6. Daily window reset if 24h elapsed
/// 7. spent_today + amount <= max_spend_per_day (checked arithmetic)
/// 8. Program whitelist (if non-empty)
pub fn handler(ctx: Context<GuardedWithdraw>, amount: u64) -> Result<()> {
    // SECURITY [CRITICAL-5]: Validate USDC mint on every withdrawal.
    // Even though initialize_vault checks this, we verify again to prevent
    // attacks where the mint account is swapped between init and withdraw.
    let mint_key = ctx.accounts.usdc_mint.key();
    require!(
        mint_key == USDC_MINT_DEVNET || mint_key == USDC_MINT_MAINNET,
        GuardError::InvalidUsdcMint
    );

    let vault = &mut ctx.accounts.vault;
    let now = Clock::get()?.unix_timestamp;

    // 1. Vault must be active
    require!(vault.is_active, GuardError::VaultPaused);

    // 2. Signer must be the authorized agent
    require!(
        ctx.accounts.agent.key() == vault.agent,
        GuardError::Unauthorized
    );

    // 3. Check agent expiry (0 = no expiry)
    if vault.agent_expires_at > 0 {
        require!(now < vault.agent_expires_at, GuardError::AgentExpired);
    }

    // 4. Amount must be positive
    require!(amount > 0, GuardError::ZeroAmount);

    // 5. Per-transaction limit
    require!(
        amount <= vault.max_spend_per_tx,
        GuardError::ExceedsPerTxLimit
    );

    // 6. Daily window reset — if 24h have elapsed, reset counter
    let elapsed = now
        .checked_sub(vault.day_window_start)
        .ok_or(GuardError::ArithmeticOverflow)?;
    if elapsed >= SECONDS_PER_DAY {
        vault.spent_today = 0;
        vault.day_window_start = now;
    }

    // 7. Daily cap check with checked arithmetic
    let new_total = vault
        .spent_today
        .checked_add(amount)
        .ok_or(GuardError::ArithmeticOverflow)?;
    require!(
        new_total <= vault.max_spend_per_day,
        GuardError::ExceedsDailyCap
    );

    // 8. Destination whitelist — if non-empty, destination authority must be whitelisted.
    //
    // SECURITY [CRITICAL-6]: `allowed_programs` contains whitelisted destination
    // AUTHORITIES (wallets/PDAs that control the destination token account), NOT
    // program IDs. The check verifies that the authority of the destination token
    // account is in the whitelist. This prevents funds from being sent to
    // unauthorized wallets/PDAs.
    //
    // NOTE: `TokenAccount.owner` in SPL Token is the AUTHORITY (the pubkey that
    // can transfer tokens from this account), not the Solana account owner
    // (which is always the Token Program for all token accounts).
    if !vault.allowed_programs.is_empty() {
        let dest_authority = ctx.accounts.destination_token_account.owner;
        // Also check the destination token account address itself,
        // to support whitelisting by token account address.
        let dest_address = ctx.accounts.destination_token_account.key();
        let is_whitelisted = vault.allowed_programs.contains(&dest_authority)
            || vault.allowed_programs.contains(&dest_address);
        require!(
            is_whitelisted,
            GuardError::ProgramNotWhitelisted
        );
    }

    // --- All checks passed. Mutate state THEN transfer. ---

    // Update spent_today BEFORE the CPI transfer (reserve-then-forward pattern)
    vault.spent_today = new_total;

    // Build PDA signer seeds for CPI
    let owner_key = vault.owner;
    let bump = vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, owner_key.as_ref(), &[bump]]];

    // Execute SPL Token transfer via CPI
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.destination_token_account.to_account_info(),
            authority: vault.to_account_info(),
        },
        signer_seeds,
    );

    token::transfer(transfer_ctx, amount)?;

    // Emit event for off-chain audit
    emit!(WithdrawExecuted {
        vault: vault.key(),
        agent: ctx.accounts.agent.key(),
        destination: ctx.accounts.destination_token_account.key(),
        amount,
        spent_today_after: vault.spent_today,
        timestamp: now,
    });

    msg!(
        "Guarded withdraw: {} USDC lamports from vault {} (spent today: {})",
        amount,
        vault.key(),
        vault.spent_today
    );

    Ok(())
}

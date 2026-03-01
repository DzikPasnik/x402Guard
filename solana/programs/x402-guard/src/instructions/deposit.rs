use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::VAULT_SEED;
use crate::errors::GuardError;
use crate::state::VaultState;

/// Accounts required for the `deposit` instruction.
///
/// Any user can deposit USDC into a vault — not restricted to the owner.
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// Depositor — signs and pays for the transfer.
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Vault PDA — seeds validated but not mutable (no state change on deposit).
    #[account(
        seeds = [VAULT_SEED, vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// Depositor's USDC token account — source of funds.
    #[account(
        mut,
        constraint = depositor_token_account.mint == usdc_mint.key(),
        constraint = depositor_token_account.owner == depositor.key(),
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    /// Vault's USDC token account — destination for deposit.
    #[account(
        mut,
        constraint = vault_token_account.mint == usdc_mint.key(),
        constraint = vault_token_account.owner == vault.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// USDC mint — validated by token account constraints above.
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

/// Deposit USDC into the vault.
///
/// Executes a standard SPL Token transfer from the depositor's ATA
/// to the vault's ATA. Anyone can deposit; only the agent can withdraw
/// (subject to guardrails), and only the owner can close.
pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, GuardError::ZeroAmount);

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );

    token::transfer(transfer_ctx, amount)?;

    msg!(
        "Deposited {} USDC lamports into vault {}",
        amount,
        ctx.accounts.vault.key()
    );

    Ok(())
}

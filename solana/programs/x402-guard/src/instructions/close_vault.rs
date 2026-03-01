use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::constants::VAULT_SEED;
use crate::errors::GuardError;
use crate::state::VaultState;

/// Accounts required for the `close_vault` instruction.
///
/// Owner-only. Drains all USDC and closes both the ATA and vault PDA.
///
/// Security note: The program whitelist is NOT checked here.
/// The owner can always recover their funds regardless of `allowed_programs`.
/// The whitelist only restricts agent withdrawals via `guarded_withdraw`.
#[derive(Accounts)]
pub struct CloseVault<'info> {
    /// Vault owner — receives all remaining USDC and rent lamports.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Vault PDA — will be closed (Anchor zeros discriminator, prevents resurrection).
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.owner.as_ref()],
        bump = vault.bump,
        has_one = owner @ GuardError::Unauthorized,
        close = owner,
    )]
    pub vault: Account<'info, VaultState>,

    /// Vault's USDC token account — will be drained and closed.
    #[account(
        mut,
        constraint = vault_token_account.mint == usdc_mint.key(),
        constraint = vault_token_account.owner == vault.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Owner's USDC token account — receives remaining USDC.
    #[account(
        mut,
        constraint = owner_token_account.mint == usdc_mint.key(),
        constraint = owner_token_account.owner == owner.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// USDC mint — validated by token account constraints.
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

/// Close the vault, returning all USDC and rent to the owner.
///
/// Steps:
/// 1. Transfer all remaining USDC from vault ATA to owner ATA via CPI
/// 2. Close vault ATA (remaining lamports go to owner)
/// 3. Vault PDA closed by Anchor's `close = owner` constraint
pub fn handler(ctx: Context<CloseVault>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let owner_key = vault.owner;
    let bump = vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, owner_key.as_ref(), &[bump]]];

    // 1. Transfer all remaining USDC to owner
    let remaining_balance = ctx.accounts.vault_token_account.amount;
    if remaining_balance > 0 {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, remaining_balance)?;
    }

    // 2. Close vault ATA — remaining rent lamports go to owner
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault_token_account.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;

    // 3. Vault PDA closure handled by Anchor's `close = owner` attribute
    //    This zeros the discriminator and transfers lamports to owner.

    msg!(
        "Vault {} closed by owner {}. {} USDC lamports returned.",
        ctx.accounts.vault.key(),
        ctx.accounts.owner.key(),
        remaining_balance
    );

    Ok(())
}

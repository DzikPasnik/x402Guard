use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::constants::{MAX_ALLOWED_PROGRAMS, VAULT_SEED};
use crate::errors::GuardError;
use crate::state::VaultState;

/// Accounts required for the `initialize_vault` instruction.
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// Vault owner — pays for account creation and owns the vault.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Vault PDA account to be initialized.
    /// Seeds: ["vault", owner.key()]
    #[account(
        init,
        payer = owner,
        space = VaultState::SPACE,
        seeds = [VAULT_SEED, owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, VaultState>,

    /// Associated token account for the vault PDA to hold USDC.
    #[account(
        init,
        payer = owner,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// USDC mint account. Validated by the ATA constraint above.
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Parameters for vault initialization.
#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct InitializeVaultParams {
    /// Authorized agent pubkey. Must not be Pubkey::default().
    pub agent: Pubkey,
    /// Maximum USDC per single transaction (6 decimals). Must be > 0.
    pub max_spend_per_tx: u64,
    /// Maximum USDC per 24h window (6 decimals). Must be >= max_spend_per_tx.
    pub max_spend_per_day: u64,
    /// Unix timestamp when agent expires. 0 = no expiry.
    pub agent_expires_at: i64,
    /// Whitelisted destination programs. Empty = any allowed. Max 10.
    pub allowed_programs: Vec<Pubkey>,
}

/// Initialize a new PDA vault with configurable guardrails.
///
/// Validates all parameters before writing state. Fail-closed on any invalid input.
pub fn handler(ctx: Context<InitializeVault>, params: InitializeVaultParams) -> Result<()> {
    // Validate agent is not the default (zero) key
    require!(
        params.agent != Pubkey::default(),
        GuardError::InvalidAgentPubkey
    );

    // Validate spend limits
    require!(
        params.max_spend_per_tx > 0 && params.max_spend_per_day > 0,
        GuardError::InvalidLimits
    );
    require!(
        params.max_spend_per_day >= params.max_spend_per_tx,
        GuardError::InvalidLimits
    );

    // Validate allowed programs count
    require!(
        params.allowed_programs.len() <= MAX_ALLOWED_PROGRAMS,
        GuardError::TooManyPrograms
    );

    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.agent = params.agent;
    vault.max_spend_per_tx = params.max_spend_per_tx;
    vault.max_spend_per_day = params.max_spend_per_day;
    vault.spent_today = 0;
    vault.day_window_start = Clock::get()?.unix_timestamp;
    vault.agent_expires_at = params.agent_expires_at;
    vault.allowed_programs = params.allowed_programs;
    vault.is_active = true;
    vault.bump = ctx.bumps.vault;
    vault._reserved = [0u8; 64];

    msg!(
        "Vault initialized for owner {} with agent {}",
        vault.owner,
        vault.agent
    );

    Ok(())
}

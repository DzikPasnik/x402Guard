use anchor_lang::prelude::*;

use crate::constants::{MAX_ALLOWED_PROGRAMS, VAULT_SEED};
use crate::errors::GuardError;
use crate::state::VaultState;

/// Accounts required for the `update_rules` instruction.
///
/// Owner-only operation.
#[derive(Accounts)]
pub struct UpdateRules<'info> {
    /// Vault owner — must sign to update rules.
    pub owner: Signer<'info>,

    /// Vault PDA — mutable for rule updates.
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.owner.as_ref()],
        bump = vault.bump,
        has_one = owner @ GuardError::Unauthorized,
    )]
    pub vault: Account<'info, VaultState>,
}

/// Optional parameters for rule updates.
/// Only provided fields are updated; others remain unchanged.
#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct UpdateRulesParams {
    /// New per-transaction spend limit. Must be > 0 if provided.
    pub new_max_spend_per_tx: Option<u64>,
    /// New daily spend cap. Must be >= per-tx limit if provided.
    pub new_max_spend_per_day: Option<u64>,
    /// New allowed programs whitelist. Max 10 entries.
    pub new_allowed_programs: Option<Vec<Pubkey>>,
    /// New agent pubkey. Must not be Pubkey::default() if provided.
    pub new_agent: Option<Pubkey>,
    /// New agent expiry timestamp. 0 = no expiry.
    pub new_agent_expires_at: Option<i64>,
    /// Pause or unpause the vault.
    pub new_is_active: Option<bool>,
}

/// Update vault guardrail rules. Owner-only.
///
/// Each field is optional — only provided values are applied.
/// Validation is applied to the RESULTING state, not just the new values,
/// ensuring invariants always hold (daily >= per-tx, etc.).
pub fn handler(ctx: Context<UpdateRules>, params: UpdateRulesParams) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    // Apply optional agent update first (validates before write)
    if let Some(new_agent) = params.new_agent {
        require!(
            new_agent != Pubkey::default(),
            GuardError::InvalidAgentPubkey
        );
        vault.agent = new_agent;
    }

    // Apply spend limits — validate the RESULTING combination
    if let Some(new_max_per_tx) = params.new_max_spend_per_tx {
        require!(new_max_per_tx > 0, GuardError::InvalidLimits);
        vault.max_spend_per_tx = new_max_per_tx;
    }

    if let Some(new_max_per_day) = params.new_max_spend_per_day {
        require!(new_max_per_day > 0, GuardError::InvalidLimits);
        vault.max_spend_per_day = new_max_per_day;
    }

    // Validate daily >= per-tx invariant after both updates applied
    require!(
        vault.max_spend_per_day >= vault.max_spend_per_tx,
        GuardError::InvalidLimits
    );

    // Apply allowed programs update
    if let Some(new_programs) = params.new_allowed_programs {
        require!(
            new_programs.len() <= MAX_ALLOWED_PROGRAMS,
            GuardError::TooManyPrograms
        );
        vault.allowed_programs = new_programs;
    }

    // Apply agent expiry
    if let Some(new_expires_at) = params.new_agent_expires_at {
        vault.agent_expires_at = new_expires_at;
    }

    // Apply active status
    if let Some(new_is_active) = params.new_is_active {
        vault.is_active = new_is_active;
    }

    msg!(
        "Vault rules updated by owner {} for vault {}",
        ctx.accounts.owner.key(),
        vault.key()
    );

    Ok(())
}

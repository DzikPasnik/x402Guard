use anchor_lang::prelude::*;

use crate::constants::VAULT_SEED;
use crate::errors::GuardError;
use crate::state::VaultState;

/// Accounts required for the `revoke_agent` instruction.
///
/// Owner-only kill switch — immediately disables agent access.
#[derive(Accounts)]
pub struct RevokeAgent<'info> {
    /// Vault owner — must sign to revoke.
    pub owner: Signer<'info>,

    /// Vault PDA — mutable for agent zeroing and pause.
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.owner.as_ref()],
        bump = vault.bump,
        has_one = owner @ GuardError::Unauthorized,
    )]
    pub vault: Account<'info, VaultState>,
}

/// Event emitted on agent revocation for off-chain audit.
#[event]
pub struct AgentRevoked {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub revoked_agent: Pubkey,
    pub timestamp: i64,
}

/// Revoke agent access. Owner-only kill switch.
///
/// Effects:
/// - agent set to Pubkey::default() (zero key = revoked)
/// - vault paused (is_active = false)
/// - agent_expires_at zeroed
///
/// After revocation, no guarded_withdraw calls will succeed because:
/// 1. is_active is false (VaultPaused check)
/// 2. agent is Pubkey::default() (no signer can match)
///
/// Owner can re-enable via update_rules with a new agent key.
pub fn handler(ctx: Context<RevokeAgent>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let now = Clock::get()?.unix_timestamp;

    let revoked_agent = vault.agent;

    // Kill switch: zero agent, pause vault, clear expiry
    vault.agent = Pubkey::default();
    vault.is_active = false;
    vault.agent_expires_at = 0;

    emit!(AgentRevoked {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        revoked_agent,
        timestamp: now,
    });

    msg!(
        "Agent {} revoked from vault {} by owner {}",
        revoked_agent,
        vault.key(),
        ctx.accounts.owner.key()
    );

    Ok(())
}

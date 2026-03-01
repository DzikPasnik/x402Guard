use anchor_lang::prelude::*;

use crate::constants::MAX_ALLOWED_PROGRAMS;

/// On-chain state for a PDA vault guarding USDC spending.
///
/// Seeds: ["vault", owner.key().as_ref()]
///
/// SPACE = 8 (discriminator)
///       + 32 (owner)
///       + 32 (agent)
///       + 8 (max_spend_per_tx)
///       + 8 (max_spend_per_day)
///       + 8 (spent_today)
///       + 8 (day_window_start)
///       + 8 (agent_expires_at)
///       + 4 + 32*10 (allowed_programs Vec<Pubkey>)
///       + 1 (is_active)
///       + 1 (bump)
///       + 64 (_reserved)
///       = 502 bytes
#[account]
pub struct VaultState {
    /// Vault owner — can update rules, revoke agent, close vault.
    pub owner: Pubkey,

    /// Authorized agent pubkey. Pubkey::default() means revoked.
    pub agent: Pubkey,

    /// Maximum USDC amount per single transaction (6 decimals).
    pub max_spend_per_tx: u64,

    /// Maximum USDC amount per 24-hour rolling window (6 decimals).
    pub max_spend_per_day: u64,

    /// Amount spent in the current day window (6 decimals).
    pub spent_today: u64,

    /// Unix timestamp marking the start of the current day window.
    pub day_window_start: i64,

    /// Unix timestamp when the agent key expires. 0 = no expiry.
    pub agent_expires_at: i64,

    /// Whitelisted destination programs. Empty = any destination allowed.
    pub allowed_programs: Vec<Pubkey>,

    /// Whether the vault is active. false = paused (no agent ops).
    pub is_active: bool,

    /// PDA bump seed — stored to avoid recomputation.
    pub bump: u8,

    /// Reserved bytes for future fields without realloc.
    pub _reserved: [u8; 64],
}

impl VaultState {
    /// Total space required for account allocation including discriminator.
    pub const SPACE: usize = 8   // Anchor discriminator
        + 32  // owner
        + 32  // agent
        + 8   // max_spend_per_tx
        + 8   // max_spend_per_day
        + 8   // spent_today
        + 8   // day_window_start
        + 8   // agent_expires_at
        + (4 + 32 * MAX_ALLOWED_PROGRAMS) // allowed_programs (Vec prefix + max entries)
        + 1   // is_active
        + 1   // bump
        + 64; // _reserved
}

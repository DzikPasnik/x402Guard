use anchor_lang::prelude::*;

/// Error codes for the x402-guard program.
/// Each variant maps to a unique error code for on-chain and off-chain handling.
#[error_code]
pub enum GuardError {
    /// Signer is not authorized for this operation.
    #[msg("Unauthorized: signer does not match expected authority")]
    Unauthorized,

    /// Vault is paused; no agent operations allowed.
    #[msg("Vault is paused")]
    VaultPaused,

    /// Agent key has expired.
    #[msg("Agent key has expired")]
    AgentExpired,

    /// Withdrawal amount must be greater than zero.
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    /// Amount exceeds the per-transaction spend limit.
    #[msg("Amount exceeds per-transaction limit")]
    ExceedsPerTxLimit,

    /// Amount would exceed the daily spend cap.
    #[msg("Amount would exceed daily spend cap")]
    ExceedsDailyCap,

    /// Destination program is not in the vault's whitelist.
    #[msg("Destination program not whitelisted")]
    ProgramNotWhitelisted,

    /// Provided agent pubkey is invalid (e.g. default/zero key).
    #[msg("Invalid agent pubkey (cannot be default)")]
    InvalidAgentPubkey,

    /// Spend limits are invalid (zero or inconsistent).
    #[msg("Invalid limits: must be > 0 and daily >= per-tx")]
    InvalidLimits,

    /// Too many programs in the whitelist.
    #[msg("Too many allowed programs (max 10)")]
    TooManyPrograms,

    /// Arithmetic overflow detected in spend calculation.
    #[msg("Arithmetic overflow in spend calculation")]
    ArithmeticOverflow,
}

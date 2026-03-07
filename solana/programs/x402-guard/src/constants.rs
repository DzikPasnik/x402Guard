use anchor_lang::prelude::*;

/// Maximum number of whitelisted destination authorities for a vault.
/// Capped to prevent excessive account size and iteration cost.
pub const MAX_ALLOWED_PROGRAMS: usize = 10;

/// Seconds in a 24-hour window, used for daily spend cap resets.
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Seed prefix for vault PDA derivation.
pub const VAULT_SEED: &[u8] = b"vault";

/// SECURITY [CRITICAL-5]: Known USDC SPL mint addresses.
///
/// The vault ONLY accepts deposits/withdrawals of genuine USDC tokens.
/// Using an unchecked mint allows an attacker to create a fake "USDC" token
/// and drain the vault's real USDC or bypass spend tracking.
///
/// Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
/// Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
pub const USDC_MINT_DEVNET: Pubkey =
    solana_program::pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

pub const USDC_MINT_MAINNET: Pubkey =
    solana_program::pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

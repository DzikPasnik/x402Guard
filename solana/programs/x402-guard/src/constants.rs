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
pub const USDC_MINT_DEVNET: Pubkey = Pubkey::new_from_array([
    59, 68, 44, 179, 145, 33, 87, 241, 58, 147, 61, 1, 52, 40, 45, 3,
    43, 95, 254, 205, 1, 162, 219, 241, 183, 121, 6, 8, 223, 0, 46, 167,
]);

pub const USDC_MINT_MAINNET: Pubkey = Pubkey::new_from_array([
    198, 250, 122, 243, 190, 219, 173, 58, 61, 101, 243, 106, 171, 201, 116, 49,
    177, 187, 228, 194, 210, 246, 224, 228, 124, 166, 2, 3, 69, 47, 93, 97,
]);

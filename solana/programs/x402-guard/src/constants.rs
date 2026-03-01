/// Maximum number of whitelisted programs for a vault.
/// Capped to prevent excessive account size and iteration cost.
pub const MAX_ALLOWED_PROGRAMS: usize = 10;

/// Seconds in a 24-hour window, used for daily spend cap resets.
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Seed prefix for vault PDA derivation.
pub const VAULT_SEED: &[u8] = b"vault";

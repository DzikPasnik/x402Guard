//! Lightweight Solana JSON-RPC client using reqwest.
//!
//! This replaces `solana-sdk`/`solana-client` to avoid serde version conflicts
//! (the proxy pins `serde = "=1.0.219"` for alloy-consensus compatibility).
//!
//! Only read-only operations are needed — the proxy is non-custodial and never
//! submits transactions. Agents sign and submit `guarded_withdraw` independently.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ─── Solana base58 pubkey utilities ────────────────────────────────────────

/// Decode a base58-encoded Solana public key into 32 bytes.
///
/// Returns an error if the input is not valid base58 or not exactly 32 bytes.
pub fn decode_pubkey(b58: &str) -> Result<[u8; 32]> {
    // Validate length heuristic: base58-encoded 32 bytes is 32-44 chars
    if b58.is_empty() || b58.len() > 50 {
        return Err(anyhow!("invalid pubkey length: {}", b58.len()));
    }

    let bytes = bs58_decode(b58).context("invalid base58 pubkey")?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|v: Vec<u8>| anyhow!("pubkey must be 32 bytes, got {}", v.len()))?;
    Ok(arr)
}

/// Encode 32 bytes as a base58 Solana public key string.
pub fn encode_pubkey(bytes: &[u8; 32]) -> String {
    bs58_encode(bytes)
}

// ─── Minimal base58 codec (Bitcoin alphabet) ───────────────────────────────
//
// Solana uses the Bitcoin base58 alphabet. We implement a minimal codec here
// to avoid adding a dependency. The proxy only encodes/decodes 32-byte pubkeys,
// so performance is not critical.

const BASE58_ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

fn bs58_decode(input: &str) -> Result<Vec<u8>> {
    if input.is_empty() {
        return Ok(vec![]);
    }

    // Build reverse lookup table
    let mut alpha_map = [255u8; 128];
    for (i, &c) in BASE58_ALPHABET.iter().enumerate() {
        alpha_map[c as usize] = i as u8;
    }

    // Count leading '1's (they map to leading zero bytes)
    let leading_zeros = input.bytes().take_while(|&b| b == b'1').count();

    // Convert base58 to base256
    let mut result: Vec<u8> = Vec::new();
    for ch in input.bytes() {
        if ch >= 128 {
            return Err(anyhow!("non-ASCII character in base58"));
        }
        let digit = alpha_map[ch as usize];
        if digit == 255 {
            return Err(anyhow!("invalid base58 character: '{}'", ch as char));
        }
        let mut carry = digit as u32;
        for byte in result.iter_mut().rev() {
            carry += (*byte as u32) * 58;
            *byte = (carry & 0xFF) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            result.insert(0, (carry & 0xFF) as u8);
            carry >>= 8;
        }
    }

    // Prepend leading zero bytes
    let mut output = vec![0u8; leading_zeros];
    output.extend(result);
    Ok(output)
}

fn bs58_encode(input: &[u8]) -> String {
    if input.is_empty() {
        return String::new();
    }

    // Count leading zeros
    let leading_zeros = input.iter().take_while(|&&b| b == 0).count();

    // Convert base256 to base58
    let mut digits: Vec<u8> = Vec::new();
    for &byte in input {
        let mut carry = byte as u32;
        for d in digits.iter_mut().rev() {
            carry += (*d as u32) * 256;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.insert(0, (carry % 58) as u8);
            carry /= 58;
        }
    }

    // Build output string
    let mut result = String::with_capacity(leading_zeros + digits.len());
    for _ in 0..leading_zeros {
        result.push('1');
    }
    for d in digits {
        result.push(BASE58_ALPHABET[d as usize] as char);
    }
    result
}

// ─── VaultState deserialization ────────────────────────────────────────────

/// Deserialized VaultState from on-chain Solana account data.
///
/// Layout matches `solana/programs/x402-guard/src/state/vault.rs`:
/// - 8 bytes Anchor discriminator (skipped)
/// - 32 bytes owner pubkey
/// - 32 bytes agent pubkey
/// - 8 bytes max_spend_per_tx (u64 LE)
/// - 8 bytes max_spend_per_day (u64 LE)
/// - 8 bytes spent_today (u64 LE)
/// - 8 bytes day_window_start (i64 LE)
/// - 8 bytes agent_expires_at (i64 LE)
/// - 4 bytes allowed_programs Vec length (u32 LE) + N * 32 bytes
/// - 1 byte is_active (bool)
/// - 1 byte bump (u8)
/// - 64 bytes _reserved
#[derive(Debug, Clone)]
pub struct VaultState {
    pub owner: [u8; 32],
    pub agent: [u8; 32],
    pub max_spend_per_tx: u64,
    pub max_spend_per_day: u64,
    pub spent_today: u64,
    pub day_window_start: i64,
    pub agent_expires_at: i64,
    pub allowed_programs: Vec<[u8; 32]>,
    pub is_active: bool,
    pub bump: u8,
}

/// Minimum account data size (with 0 allowed_programs):
/// 8 (disc) + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 4 + 1 + 1 + 64 = 182
const MIN_VAULT_DATA_SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 4 + 1 + 1 + 64;

impl VaultState {
    /// Deserialize VaultState from raw account bytes (including Anchor discriminator).
    ///
    /// Returns an error if the data is too short or has an unexpected format.
    pub fn from_account_data(data: &[u8]) -> Result<Self> {
        if data.len() < MIN_VAULT_DATA_SIZE {
            return Err(anyhow!(
                "account data too short: {} bytes, need at least {}",
                data.len(),
                MIN_VAULT_DATA_SIZE
            ));
        }

        let mut pos = 8; // Skip Anchor discriminator

        let owner = read_pubkey(data, &mut pos)?;
        let agent = read_pubkey(data, &mut pos)?;
        let max_spend_per_tx = read_u64(data, &mut pos)?;
        let max_spend_per_day = read_u64(data, &mut pos)?;
        let spent_today = read_u64(data, &mut pos)?;
        let day_window_start = read_i64(data, &mut pos)?;
        let agent_expires_at = read_i64(data, &mut pos)?;

        // Vec<Pubkey>: 4-byte length prefix + N * 32 bytes
        let vec_len = read_u32(data, &mut pos)? as usize;
        if vec_len > 10 {
            return Err(anyhow!(
                "allowed_programs length {} exceeds maximum 10",
                vec_len
            ));
        }
        let needed = pos + vec_len * 32 + 1 + 1 + 64;
        if data.len() < needed {
            return Err(anyhow!(
                "account data too short for {} allowed_programs: {} bytes, need {}",
                vec_len,
                data.len(),
                needed
            ));
        }

        let mut allowed_programs = Vec::with_capacity(vec_len);
        for _ in 0..vec_len {
            allowed_programs.push(read_pubkey(data, &mut pos)?);
        }

        let is_active = data[pos] != 0;
        pos += 1;

        let bump = data[pos];
        // pos += 1; // _reserved follows but we don't need it

        Ok(Self {
            owner,
            agent,
            max_spend_per_tx,
            max_spend_per_day,
            spent_today,
            day_window_start,
            agent_expires_at,
            allowed_programs,
            is_active,
            bump,
        })
    }
}

/// Read a 32-byte pubkey from data at the given position, advancing pos.
fn read_pubkey(data: &[u8], pos: &mut usize) -> Result<[u8; 32]> {
    if *pos + 32 > data.len() {
        return Err(anyhow!("not enough data for pubkey at offset {}", *pos));
    }
    let mut buf = [0u8; 32];
    buf.copy_from_slice(&data[*pos..*pos + 32]);
    *pos += 32;
    Ok(buf)
}

/// Read a u64 (little-endian) from data at the given position, advancing pos.
fn read_u64(data: &[u8], pos: &mut usize) -> Result<u64> {
    if *pos + 8 > data.len() {
        return Err(anyhow!("not enough data for u64 at offset {}", *pos));
    }
    let val = u64::from_le_bytes(data[*pos..*pos + 8].try_into().unwrap());
    *pos += 8;
    Ok(val)
}

/// Read an i64 (little-endian) from data at the given position, advancing pos.
fn read_i64(data: &[u8], pos: &mut usize) -> Result<i64> {
    if *pos + 8 > data.len() {
        return Err(anyhow!("not enough data for i64 at offset {}", *pos));
    }
    let val = i64::from_le_bytes(data[*pos..*pos + 8].try_into().unwrap());
    *pos += 8;
    Ok(val)
}

/// Read a u32 (little-endian) from data at the given position, advancing pos.
fn read_u32(data: &[u8], pos: &mut usize) -> Result<u32> {
    if *pos + 4 > data.len() {
        return Err(anyhow!("not enough data for u32 at offset {}", *pos));
    }
    let val = u32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap());
    *pos += 4;
    Ok(val)
}

// ─── PDA derivation ───────────────────────────────────────────────────────

/// Derive the vault PDA address from an owner pubkey and program ID.
///
/// Seeds: `["vault", owner_pubkey]`
///
/// Matches Solana's `Pubkey::find_program_address` logic:
/// tries bump seeds from 255 down to 0 until finding one that produces a point
/// NOT on the ed25519 curve (i.e., a valid PDA).
///
/// Returns `(pda_bytes, bump)` or an error if no valid bump found.
pub fn derive_vault_pda(owner: &[u8; 32], program_id: &[u8; 32]) -> Result<([u8; 32], u8)> {
    for bump in (0..=255u8).rev() {
        let hash = sha256_pda_seeds(
            &[b"vault".as_slice(), owner.as_slice(), &[bump]],
            program_id,
        );

        // A valid PDA must NOT be on the ed25519 curve.
        if !is_on_ed25519_curve(&hash) {
            return Ok((hash, bump));
        }
    }
    Err(anyhow!("failed to derive vault PDA — no valid bump found"))
}

/// Compute SHA-256 for PDA derivation: `H(seed_0 || seed_1 || ... || program_id || "ProgramDerivedAddress")`
fn sha256_pda_seeds(seeds: &[&[u8]], program_id: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    for seed in seeds {
        hasher.update(seed);
    }
    hasher.update(program_id);
    hasher.update(b"ProgramDerivedAddress");
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// Check if a 32-byte value is on the ed25519 curve.
///
/// Uses `curve25519-dalek` for correct compressed point decompression.
/// A valid PDA must NOT be on the curve.
fn is_on_ed25519_curve(bytes: &[u8; 32]) -> bool {
    use curve25519_dalek::edwards::CompressedEdwardsY;
    let compressed = CompressedEdwardsY(*bytes);
    compressed.decompress().is_some()
}

/// Derive the Associated Token Account (ATA) address for a given wallet and mint.
///
/// ATA PDA seeds: [wallet_pubkey, token_program_id, mint_pubkey]
/// Program: Associated Token Account Program (ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL)
pub fn derive_ata(wallet: &[u8; 32], mint: &[u8; 32]) -> Result<[u8; 32]> {
    // SPL Token Program ID: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
    let token_program = decode_pubkey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")?;
    // Associated Token Account Program ID: ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
    let ata_program = decode_pubkey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")?;

    // ATA PDA: find_program_address([wallet, token_program, mint], ata_program)
    for bump in (0..=255u8).rev() {
        let hash = sha256_pda_seeds(
            &[
                wallet.as_slice(),
                token_program.as_slice(),
                mint.as_slice(),
                &[bump],
            ],
            &ata_program,
        );
        if !is_on_ed25519_curve(&hash) {
            return Ok(hash);
        }
    }
    Err(anyhow!("failed to derive ATA address — no valid bump found"))
}

// ─── JSON-RPC client ──────────────────────────────────────────────────────

/// JSON-RPC request body.
#[derive(Serialize)]
struct RpcRequest<'a> {
    jsonrpc: &'a str,
    id: u64,
    method: &'a str,
    params: serde_json::Value,
}

/// JSON-RPC response envelope.
#[derive(Deserialize)]
struct RpcResponse {
    result: Option<serde_json::Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize, Debug)]
struct RpcError {
    code: i64,
    message: String,
}

/// Fetch raw account data for a Solana account via JSON-RPC `getAccountInfo`.
///
/// Returns `Ok(None)` if the account does not exist.
/// Returns `Ok(Some(bytes))` with the base64-decoded account data.
///
/// SECURITY: The RPC URL must be validated at config load time (HTTPS for mainnet).
pub async fn get_account_info(
    client: &reqwest::Client,
    rpc_url: &str,
    pubkey_b58: &str,
) -> Result<Option<Vec<u8>>> {
    let request = RpcRequest {
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: serde_json::json!([
            pubkey_b58,
            { "encoding": "base64" }
        ]),
    };

    let response = client
        .post(rpc_url)
        .json(&request)
        .send()
        .await
        .context("Solana RPC request failed")?;

    let status = response.status();
    if !status.is_success() {
        return Err(anyhow!("Solana RPC returned HTTP {}", status));
    }

    let rpc_response: RpcResponse = response
        .json()
        .await
        .context("failed to parse Solana RPC response")?;

    if let Some(err) = rpc_response.error {
        return Err(anyhow!(
            "Solana RPC error {}: {}",
            err.code,
            err.message
        ));
    }

    let result = match rpc_response.result {
        Some(v) => v,
        None => return Ok(None),
    };

    // Parse: { "value": { "data": ["base64data", "base64"], ... } }
    let value = match result.get("value") {
        Some(v) if !v.is_null() => v,
        _ => return Ok(None), // Account does not exist
    };

    let data_arr = value
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| anyhow!("unexpected getAccountInfo response format"))?;

    let b64_data = data_arr
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("missing base64 data in getAccountInfo response"))?;

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .context("failed to decode base64 account data")?;

    Ok(Some(bytes))
}

/// Fetch SPL token account balance via JSON-RPC `getTokenAccountBalance`.
///
/// Returns the balance as a raw u64 amount (e.g., USDC with 6 decimals).
///
/// SECURITY: The RPC URL must be validated at config load time (HTTPS for mainnet).
pub async fn get_token_account_balance(
    client: &reqwest::Client,
    rpc_url: &str,
    ata_b58: &str,
) -> Result<u64> {
    let request = RpcRequest {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountBalance",
        params: serde_json::json!([ata_b58]),
    };

    let response = client
        .post(rpc_url)
        .json(&request)
        .send()
        .await
        .context("Solana RPC request failed")?;

    let status = response.status();
    if !status.is_success() {
        return Err(anyhow!("Solana RPC returned HTTP {}", status));
    }

    let rpc_response: RpcResponse = response
        .json()
        .await
        .context("failed to parse Solana RPC response")?;

    if let Some(err) = rpc_response.error {
        return Err(anyhow!(
            "Solana RPC error {}: {}",
            err.code,
            err.message
        ));
    }

    let result = rpc_response
        .result
        .ok_or_else(|| anyhow!("no result in getTokenAccountBalance response"))?;

    // Parse: { "value": { "amount": "12345", ... } }
    let amount_str = result
        .get("value")
        .and_then(|v| v.get("amount"))
        .and_then(|a| a.as_str())
        .ok_or_else(|| anyhow!("unexpected getTokenAccountBalance response format"))?;

    amount_str
        .parse::<u64>()
        .context("failed to parse token balance amount")
}

// ─── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base58_roundtrip() {
        let original = [42u8; 32];
        let encoded = bs58_encode(&original);
        let decoded = bs58_decode(&encoded).unwrap();
        assert_eq!(decoded, original.to_vec());
    }

    #[test]
    fn test_decode_pubkey_valid() {
        // System program: all zeros = "11111111111111111111111111111111"
        let result = decode_pubkey("11111111111111111111111111111111");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), [0u8; 32]);
    }

    #[test]
    fn test_decode_pubkey_invalid() {
        assert!(decode_pubkey("").is_err());
        assert!(decode_pubkey("invalid!@#$").is_err());
    }

    #[test]
    fn test_encode_pubkey_zeros() {
        let zeros = [0u8; 32];
        let encoded = encode_pubkey(&zeros);
        assert_eq!(encoded, "11111111111111111111111111111111");
    }

    #[test]
    fn test_vault_state_deserialization() {
        // Build a minimal VaultState with 0 allowed_programs
        let mut data = vec![0u8; MIN_VAULT_DATA_SIZE];

        // Anchor discriminator (8 bytes — arbitrary for test)
        data[0..8].copy_from_slice(&[0xAA; 8]);

        // owner pubkey (bytes 8..40)
        data[8..40].copy_from_slice(&[1u8; 32]);

        // agent pubkey (bytes 40..72)
        data[40..72].copy_from_slice(&[2u8; 32]);

        // max_spend_per_tx = 1_000_000 (bytes 72..80)
        data[72..80].copy_from_slice(&1_000_000u64.to_le_bytes());

        // max_spend_per_day = 10_000_000 (bytes 80..88)
        data[80..88].copy_from_slice(&10_000_000u64.to_le_bytes());

        // spent_today = 500_000 (bytes 88..96)
        data[88..96].copy_from_slice(&500_000u64.to_le_bytes());

        // day_window_start = 1700000000 (bytes 96..104)
        data[96..104].copy_from_slice(&1_700_000_000i64.to_le_bytes());

        // agent_expires_at = 1800000000 (bytes 104..112)
        data[104..112].copy_from_slice(&1_800_000_000i64.to_le_bytes());

        // allowed_programs vec length = 0 (bytes 112..116)
        data[112..116].copy_from_slice(&0u32.to_le_bytes());

        // is_active = true (byte 116)
        data[116] = 1;

        // bump = 254 (byte 117)
        data[117] = 254;

        // _reserved (bytes 118..182) already zeros

        let vault = VaultState::from_account_data(&data).expect("should deserialize");
        assert_eq!(vault.owner, [1u8; 32]);
        assert_eq!(vault.agent, [2u8; 32]);
        assert_eq!(vault.max_spend_per_tx, 1_000_000);
        assert_eq!(vault.max_spend_per_day, 10_000_000);
        assert_eq!(vault.spent_today, 500_000);
        assert_eq!(vault.day_window_start, 1_700_000_000);
        assert_eq!(vault.agent_expires_at, 1_800_000_000);
        assert!(vault.allowed_programs.is_empty());
        assert!(vault.is_active);
        assert_eq!(vault.bump, 254);
    }

    #[test]
    fn test_vault_state_with_allowed_programs() {
        // Build VaultState with 2 allowed_programs
        let total_size = MIN_VAULT_DATA_SIZE + 2 * 32; // 2 pubkeys in the vec
        let mut data = vec![0u8; total_size];

        // Discriminator
        data[0..8].copy_from_slice(&[0xBB; 8]);
        // owner
        data[8..40].copy_from_slice(&[3u8; 32]);
        // agent
        data[40..72].copy_from_slice(&[4u8; 32]);
        // max_spend_per_tx
        data[72..80].copy_from_slice(&2_000_000u64.to_le_bytes());
        // max_spend_per_day
        data[80..88].copy_from_slice(&20_000_000u64.to_le_bytes());
        // spent_today
        data[88..96].copy_from_slice(&0u64.to_le_bytes());
        // day_window_start
        data[96..104].copy_from_slice(&1_700_000_000i64.to_le_bytes());
        // agent_expires_at = 0 (no expiry)
        data[104..112].copy_from_slice(&0i64.to_le_bytes());
        // allowed_programs vec length = 2
        data[112..116].copy_from_slice(&2u32.to_le_bytes());
        // program 1
        data[116..148].copy_from_slice(&[0xAA; 32]);
        // program 2
        data[148..180].copy_from_slice(&[0xBB; 32]);
        // is_active = true
        data[180] = 1;
        // bump = 253
        data[181] = 253;
        // _reserved (182..246) already zeros

        let vault = VaultState::from_account_data(&data).expect("should deserialize");
        assert_eq!(vault.owner, [3u8; 32]);
        assert_eq!(vault.agent, [4u8; 32]);
        assert_eq!(vault.allowed_programs.len(), 2);
        assert_eq!(vault.allowed_programs[0], [0xAA; 32]);
        assert_eq!(vault.allowed_programs[1], [0xBB; 32]);
        assert!(vault.is_active);
    }

    #[test]
    fn test_vault_state_too_short() {
        let data = vec![0u8; 10]; // Way too short
        assert!(VaultState::from_account_data(&data).is_err());
    }

    #[test]
    fn test_vault_state_excessive_programs() {
        // Set allowed_programs length to 100 (exceeds max 10)
        let mut data = vec![0u8; MIN_VAULT_DATA_SIZE];
        data[0..8].copy_from_slice(&[0xCC; 8]);
        data[8..40].copy_from_slice(&[1u8; 32]);
        data[40..72].copy_from_slice(&[2u8; 32]);
        data[72..80].copy_from_slice(&1_000_000u64.to_le_bytes());
        data[80..88].copy_from_slice(&10_000_000u64.to_le_bytes());
        data[88..96].copy_from_slice(&0u64.to_le_bytes());
        data[96..104].copy_from_slice(&0i64.to_le_bytes());
        data[104..112].copy_from_slice(&0i64.to_le_bytes());
        // vec length = 100
        data[112..116].copy_from_slice(&100u32.to_le_bytes());

        assert!(VaultState::from_account_data(&data).is_err());
    }

    #[test]
    fn test_pda_derivation_deterministic() {
        let owner = [1u8; 32];
        let program = [2u8; 32];

        let (pda1, bump1) = derive_vault_pda(&owner, &program).unwrap();
        let (pda2, bump2) = derive_vault_pda(&owner, &program).unwrap();

        assert_eq!(pda1, pda2);
        assert_eq!(bump1, bump2);
    }

    #[test]
    fn test_pda_different_owners() {
        let program = [99u8; 32];

        let (pda1, _) = derive_vault_pda(&[1u8; 32], &program).unwrap();
        let (pda2, _) = derive_vault_pda(&[2u8; 32], &program).unwrap();

        assert_ne!(pda1, pda2);
    }

    #[test]
    fn test_pda_not_on_curve() {
        // PDA must not be on the ed25519 curve
        let owner = [5u8; 32];
        let program = [6u8; 32];

        let (pda, _) = derive_vault_pda(&owner, &program).unwrap();
        assert!(!is_on_ed25519_curve(&pda));
    }

    #[test]
    fn test_sha256_pda_seeds_deterministic() {
        let seed1 = b"vault";
        let owner = [7u8; 32];
        let bump = 255u8;
        let program = [8u8; 32];

        let h1 = sha256_pda_seeds(&[seed1.as_slice(), &owner, &[bump]], &program);
        let h2 = sha256_pda_seeds(&[seed1.as_slice(), &owner, &[bump]], &program);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_ata_derivation() {
        // Smoke test: derive ATA for a known wallet + mint
        let wallet = [10u8; 32];
        let mint = [20u8; 32];

        let ata = derive_ata(&wallet, &mint);
        assert!(ata.is_ok(), "ATA derivation should succeed");

        // ATA must not be on the curve (it's a PDA)
        let ata_bytes = ata.unwrap();
        assert!(!is_on_ed25519_curve(&ata_bytes));
    }
}

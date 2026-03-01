//! EIP-7702 revocation authorization data helper.
//!
//! Generates unsigned EIP-7702 authorization JSON that a client (e.g., MetaMask)
//! can sign to revoke all on-chain delegation for an EOA. The proxy NEVER holds
//! the EOA private key --- this is the non-custodial pattern.
//!
//! Phase 4 dashboard will use this data to trigger wallet signing via
//! MetaMask / RainbowKit.

/// The zero address used as the EIP-7702 delegation target for revocation.
/// Delegating to address(0) effectively revokes all prior delegations.
const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";

/// Create unsigned EIP-7702 authorization data for revoking all delegation.
///
/// # Arguments
/// * `chain_id` - The EVM chain ID (e.g., 8453 for Base Mainnet, 84532 for Base Sepolia)
/// * `eoa_nonce_hint` - Optional hint for the EOA's current nonce. If `None`, the
///   client is expected to fetch it from the RPC before signing.
///
/// # Returns
/// A `serde_json::Value` containing the unsigned authorization data:
/// ```json
/// {
///   "chain_id": 8453,
///   "address": "0x0000...0000",
///   "nonce": null,
///   "message": "Sign to revoke all EIP-7702 delegation for this EOA"
/// }
/// ```
///
/// # Non-custodial
/// This function returns DATA only. The proxy never signs anything.
/// The user/dashboard must sign this with their EOA key.
pub fn create_revoke_authorization_data(
    chain_id: u64,
    eoa_nonce_hint: Option<u64>,
) -> serde_json::Value {
    serde_json::json!({
        "chain_id": chain_id,
        "address": ZERO_ADDRESS,
        "nonce": eoa_nonce_hint,
        "message": "Sign to revoke all EIP-7702 delegation for this EOA"
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_valid_json_with_zero_address() {
        let data = create_revoke_authorization_data(8453, None);

        assert_eq!(data["chain_id"], 8453);
        assert_eq!(data["address"], ZERO_ADDRESS);
        assert!(data["nonce"].is_null());
        assert!(data["message"].as_str().unwrap().contains("revoke"));
    }

    #[test]
    fn includes_nonce_when_provided() {
        let data = create_revoke_authorization_data(84532, Some(42));

        assert_eq!(data["chain_id"], 84532);
        assert_eq!(data["address"], ZERO_ADDRESS);
        assert_eq!(data["nonce"], 42);
    }

    #[test]
    fn zero_address_is_40_hex_chars() {
        let data = create_revoke_authorization_data(1, None);
        let addr = data["address"].as_str().unwrap();

        // 0x prefix + 40 hex chars
        assert_eq!(addr.len(), 42);
        assert!(addr.starts_with("0x"));
        assert!(addr[2..].chars().all(|c| c == '0'));
    }

    #[test]
    fn different_chain_ids_produce_different_data() {
        let base_mainnet = create_revoke_authorization_data(8453, None);
        let base_sepolia = create_revoke_authorization_data(84532, None);

        assert_ne!(base_mainnet["chain_id"], base_sepolia["chain_id"]);
        // Address is always the same zero address
        assert_eq!(base_mainnet["address"], base_sepolia["address"]);
    }
}

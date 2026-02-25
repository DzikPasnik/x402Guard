//! x402 protocol types matching the Coinbase x402 specification.
//!
//! All types use camelCase JSON serialization to match the JavaScript SDK.

use alloy::primitives::{Address, B256, U256};
use serde::{Deserialize, Serialize};

/// Payment requirements returned by a service in the `X-Payment-Requirements` header.
///
/// Describes what payment the service expects before granting access.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequirements {
    /// Payment scheme — currently only `"exact"` (EIP-3009).
    pub scheme: String,
    /// Chain identifier, e.g. `"base-mainnet"` or `"base-sepolia"`.
    pub network: String,
    /// Maximum amount required in token minor units (USDC 6 decimals).
    pub max_amount_required: String,
    /// The URL resource being paid for.
    pub resource: String,
    /// Human-readable description of what the payment is for.
    #[serde(default)]
    pub description: String,
    /// MIME type of the resource.
    #[serde(default)]
    pub mime_type: String,
    /// Recipient address (service provider).
    pub pay_to: String,
    /// How long the payment proof is valid (seconds).
    pub max_timeout_seconds: u64,
    /// ERC-20 token contract address.
    pub asset: String,
    /// Free-form metadata (token name, EIP-712 version, etc.).
    #[serde(default)]
    pub extra: serde_json::Value,
}

/// Payment proof sent by the agent in the `X-Payment` header.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentPayload {
    /// Must match the scheme from `PaymentRequirements`.
    pub scheme: String,
    /// Must match the network from `PaymentRequirements`.
    pub network: String,
    /// The payment proof contents.
    pub payload: PaymentProof,
}

/// Inner proof for the `exact` scheme — an EIP-3009 TransferWithAuthorization.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentProof {
    /// EIP-712 signature (hex-encoded with 0x prefix).
    pub signature: String,
    /// The signed authorization details.
    pub authorization: TransferAuthorization,
}

/// EIP-3009 TransferWithAuthorization parameters.
///
/// The agent signs this as an EIP-712 typed message. The service
/// can then submit it on-chain to claim the payment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferAuthorization {
    /// The payer address (agent's wallet).
    pub from: String,
    /// The recipient address (must match `payTo`).
    pub to: String,
    /// Amount in token minor units.
    pub value: String,
    /// Unix timestamp — transfer valid after this time.
    pub valid_after: String,
    /// Unix timestamp — transfer valid before this time.
    pub valid_before: String,
    /// Random bytes32 nonce (hex-encoded with 0x prefix).
    pub nonce: String,
}

/// Result of a successful payment verification.
#[derive(Debug, Clone)]
pub struct VerifiedPayment {
    /// Recovered signer address.
    pub from: Address,
    /// Recipient address.
    pub to: Address,
    /// Payment amount in token minor units.
    pub value: U256,
    /// The nonce used (for deduplication).
    pub nonce: B256,
    /// Network identifier.
    pub network: String,
}

/// USDC contract addresses on supported networks.
pub mod usdc {
    use alloy::primitives::{address, Address};

    /// USDC on Base mainnet.
    pub const BASE_MAINNET: Address = address!("833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    /// USDC on Base Sepolia.
    pub const BASE_SEPOLIA: Address = address!("036CbD53842c5426634e7929541eC2318f3dCF7e");

    /// Chain ID for Base mainnet.
    pub const BASE_MAINNET_CHAIN_ID: u64 = 8453;
    /// Chain ID for Base Sepolia.
    pub const BASE_SEPOLIA_CHAIN_ID: u64 = 84532;

    /// Resolve USDC address and chain ID from network identifier.
    pub fn resolve_network(network: &str) -> Option<(Address, u64)> {
        match network {
            "base-mainnet" | "base" => Some((BASE_MAINNET, BASE_MAINNET_CHAIN_ID)),
            "base-sepolia" => Some((BASE_SEPOLIA, BASE_SEPOLIA_CHAIN_ID)),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payment_requirements_deserialize() {
        let json = r#"{
            "scheme": "exact",
            "network": "base-mainnet",
            "maxAmountRequired": "1000000",
            "resource": "https://api.example.com/data",
            "description": "Price feed access",
            "mimeType": "application/json",
            "payTo": "0x1234567890abcdef1234567890abcdef12345678",
            "maxTimeoutSeconds": 60,
            "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "extra": {"name": "USDC", "version": "2"}
        }"#;
        let req: PaymentRequirements = serde_json::from_str(json).unwrap();
        assert_eq!(req.scheme, "exact");
        assert_eq!(req.max_amount_required, "1000000");
        assert_eq!(req.max_timeout_seconds, 60);
    }

    #[test]
    fn test_payment_payload_deserialize() {
        let json = r#"{
            "scheme": "exact",
            "network": "base-mainnet",
            "payload": {
                "signature": "0xabc123",
                "authorization": {
                    "from": "0xaaaa",
                    "to": "0xbbbb",
                    "value": "1000000",
                    "validAfter": "0",
                    "validBefore": "1700000000",
                    "nonce": "0xdeadbeef"
                }
            }
        }"#;
        let payload: PaymentPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.payload.authorization.value, "1000000");
        assert_eq!(payload.payload.authorization.nonce, "0xdeadbeef");
    }

    #[test]
    fn test_usdc_resolve_network() {
        let (addr, chain_id) = usdc::resolve_network("base-mainnet").unwrap();
        assert_eq!(addr, usdc::BASE_MAINNET);
        assert_eq!(chain_id, 8453);

        let (addr, chain_id) = usdc::resolve_network("base-sepolia").unwrap();
        assert_eq!(addr, usdc::BASE_SEPOLIA);
        assert_eq!(chain_id, 84532);

        assert!(usdc::resolve_network("ethereum").is_none());
    }
}

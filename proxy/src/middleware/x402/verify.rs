//! EIP-3009 / EIP-712 signature verification for x402 payments.
//!
//! Verifies that a `TransferWithAuthorization` signature is valid for
//! the claimed `from` address, using USDC's EIP-712 domain on Base.

use alloy::primitives::{Address, B256, PrimitiveSignature, U256};
use alloy::sol;
use alloy::sol_types::SolStruct;

use crate::error::AppError;
use crate::middleware::x402::types::{PaymentPayload, PaymentRequirements, VerifiedPayment};

/// EIP-712 domain and struct definitions for USDC TransferWithAuthorization.
sol! {
    /// EIP-712 typed struct for TransferWithAuthorization (EIP-3009).
    #[derive(Debug)]
    struct TransferWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
}

/// Build the EIP-712 domain separator for USDC on the given chain.
fn usdc_eip712_domain(usdc_address: Address, chain_id: u64) -> alloy::sol_types::Eip712Domain {
    alloy::sol_types::Eip712Domain {
        name: Some("USD Coin".into()),
        version: Some("2".into()),
        chain_id: Some(U256::from(chain_id)),
        verifying_contract: Some(usdc_address),
        salt: None,
    }
}

/// Verify an x402 payment payload against its requirements.
///
/// Checks:
/// 1. Scheme is `exact`
/// 2. Network is supported and matches
/// 3. EIP-712 signature recovers to `authorization.from`
/// 4. `value >= maxAmountRequired`
/// 5. `to == payTo`
/// 6. Temporal bounds: `validAfter <= now <= validBefore`
///
/// Returns a `VerifiedPayment` on success.
pub fn verify_payment(
    requirements: &PaymentRequirements,
    payment: &PaymentPayload,
    now_secs: u64,
) -> Result<VerifiedPayment, AppError> {
    // 1. Scheme check
    if payment.scheme != "exact" {
        return Err(AppError::BadRequest(format!(
            "unsupported payment scheme: {}",
            payment.scheme
        )));
    }

    // 2. Network check
    if payment.network != requirements.network {
        return Err(AppError::BadRequest(format!(
            "network mismatch: payment={}, required={}",
            payment.network, requirements.network
        )));
    }

    let (usdc_address, chain_id) =
        super::types::usdc::resolve_network(&payment.network).ok_or_else(|| {
            AppError::BadRequest(format!("unsupported network: {}", payment.network))
        })?;

    let auth = &payment.payload.authorization;

    // Parse addresses
    let from: Address = auth
        .from
        .parse()
        .map_err(|_| AppError::BadRequest("invalid 'from' address".into()))?;
    let to: Address = auth
        .to
        .parse()
        .map_err(|_| AppError::BadRequest("invalid 'to' address".into()))?;
    let pay_to: Address = requirements
        .pay_to
        .parse()
        .map_err(|_| AppError::BadRequest("invalid 'payTo' address in requirements".into()))?;

    // Parse value — MUST be decimal only (no hex ambiguity).
    // The EIP-3009 value is always a uint256 in decimal representation.
    // Reject any hex-prefixed values to prevent amount confusion.
    if auth.value.starts_with("0x") || auth.value.starts_with("0X") {
        return Err(AppError::BadRequest(
            "value must be decimal, not hex-prefixed".into(),
        ));
    }
    let value: U256 = U256::from_str_radix(&auth.value, 10)
        .map_err(|_| AppError::BadRequest("invalid 'value' — expected decimal integer".into()))?;

    let required_amount: U256 =
        U256::from_str_radix(&requirements.max_amount_required, 10).map_err(|_| {
            AppError::BadRequest("invalid 'maxAmountRequired' in requirements".into())
        })?;

    // Parse temporal bounds
    let valid_after: u64 = auth
        .valid_after
        .parse()
        .map_err(|_| AppError::BadRequest("invalid 'validAfter'".into()))?;
    let valid_before: u64 = auth
        .valid_before
        .parse()
        .map_err(|_| AppError::BadRequest("invalid 'validBefore'".into()))?;

    // Parse nonce (bytes32 hex)
    let nonce_bytes: [u8; 32] = parse_bytes32(&auth.nonce)
        .map_err(|_| AppError::BadRequest("invalid 'nonce' — expected 32-byte hex".into()))?;
    let nonce = B256::from(nonce_bytes);

    // 3. EIP-712 signature verification
    let sig_bytes = hex::decode(payment.payload.signature.trim_start_matches("0x"))
        .map_err(|_| AppError::BadRequest("invalid signature hex".into()))?;

    let signature = PrimitiveSignature::try_from(sig_bytes.as_slice())
        .map_err(|_| AppError::BadRequest("invalid signature format (expected 65 bytes)".into()))?;

    let typed_data = TransferWithAuthorization {
        from,
        to,
        value,
        validAfter: U256::from(valid_after),
        validBefore: U256::from(valid_before),
        nonce,
    };

    let domain = usdc_eip712_domain(usdc_address, chain_id);
    let signing_hash = typed_data.eip712_signing_hash(&domain);

    let recovered = signature
        .recover_address_from_prehash(&signing_hash)
        .map_err(|_| AppError::Unauthorized("signature recovery failed".into()))?;

    if recovered != from {
        return Err(AppError::Unauthorized(format!(
            "signature signer mismatch: recovered={recovered}, claimed={from}"
        )));
    }

    // 4. Amount check
    if value < required_amount {
        return Err(AppError::BadRequest(format!(
            "payment value {value} less than required {required_amount}"
        )));
    }

    // 5. Recipient check
    if to != pay_to {
        return Err(AppError::BadRequest(format!(
            "payment recipient {to} does not match required {pay_to}"
        )));
    }

    // 6. Temporal bounds
    if now_secs < valid_after {
        return Err(AppError::BadRequest(format!(
            "payment not yet valid: validAfter={valid_after}, now={now_secs}"
        )));
    }
    if now_secs >= valid_before {
        return Err(AppError::Unauthorized(format!(
            "payment expired: validBefore={valid_before}, now={now_secs}"
        )));
    }

    Ok(VerifiedPayment {
        from,
        to,
        value,
        nonce,
        network: payment.network.clone(),
    })
}

/// Parse a hex string (with optional 0x prefix) into a 32-byte array.
fn parse_bytes32(hex_str: &str) -> Result<[u8; 32], hex::FromHexError> {
    let stripped = hex_str.trim_start_matches("0x");
    let bytes = hex::decode(stripped)?;
    if bytes.len() != 32 {
        // Pad left with zeros if shorter
        let mut result = [0u8; 32];
        let start = 32 - bytes.len();
        if bytes.len() <= 32 {
            result[start..].copy_from_slice(&bytes);
            return Ok(result);
        }
        return Err(hex::FromHexError::InvalidStringLength);
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::middleware::x402::types::{
        PaymentPayload, PaymentProof, PaymentRequirements, TransferAuthorization as AuthParams,
    };
    use alloy::primitives::address;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::signers::Signer;

    /// Helper: create a signed test payment using a random key.
    async fn create_test_payment(
        signer: &PrivateKeySigner,
        to: Address,
        value: U256,
        valid_before: u64,
        nonce: B256,
    ) -> (PaymentRequirements, PaymentPayload) {
        let from = signer.address();
        let usdc_addr = super::super::types::usdc::BASE_SEPOLIA;
        let chain_id = super::super::types::usdc::BASE_SEPOLIA_CHAIN_ID;

        let typed = super::TransferWithAuthorization {
            from,
            to,
            value,
            validAfter: U256::ZERO,
            validBefore: U256::from(valid_before),
            nonce,
        };

        let domain = usdc_eip712_domain(usdc_addr, chain_id);
        let signing_hash = typed.eip712_signing_hash(&domain);
        let sig = signer.sign_hash(&signing_hash).await.unwrap();

        let sig_hex = format!("0x{}", hex::encode(sig.as_bytes()));

        let requirements = PaymentRequirements {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            max_amount_required: value.to_string(),
            resource: "https://api.example.com/test".into(),
            description: "test".into(),
            mime_type: "application/json".into(),
            pay_to: format!("{to:?}"),
            max_timeout_seconds: 60,
            asset: format!("{usdc_addr:?}"),
            extra: serde_json::Value::Null,
        };

        let payload = PaymentPayload {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            payload: PaymentProof {
                signature: sig_hex,
                authorization: AuthParams {
                    from: format!("{from:?}"),
                    to: format!("{to:?}"),
                    value: value.to_string(),
                    valid_after: "0".into(),
                    valid_before: valid_before.to_string(),
                    nonce: format!("0x{}", hex::encode(nonce.as_slice())),
                },
            },
        };

        (requirements, payload)
    }

    /// Generate a deterministic nonce from a test-specific seed byte.
    fn test_nonce(seed: u8) -> B256 {
        B256::new([seed; 32])
    }

    #[tokio::test]
    async fn test_valid_signature() {
        let signer = PrivateKeySigner::random();
        let to = address!("1111111111111111111111111111111111111111");
        let value = U256::from(1_000_000u64); // 1 USDC
        let nonce = test_nonce(0x01);

        let (req, payload) = create_test_payment(&signer, to, value, 2_000_000_000, nonce).await;

        let result = verify_payment(&req, &payload, 1_000_000);
        assert!(result.is_ok(), "expected Ok, got {:?}", result);

        let verified = result.unwrap();
        assert_eq!(verified.from, signer.address());
        assert_eq!(verified.to, to);
        assert_eq!(verified.value, value);
    }

    #[tokio::test]
    async fn test_expired_payment() {
        let signer = PrivateKeySigner::random();
        let to = address!("1111111111111111111111111111111111111111");
        let nonce = test_nonce(0x02);

        let (req, payload) =
            create_test_payment(&signer, to, U256::from(1_000_000u64), 1_000, nonce).await;

        // now_secs > valid_before
        let result = verify_payment(&req, &payload, 2_000);
        assert!(matches!(result, Err(AppError::Unauthorized(_))));
    }

    #[tokio::test]
    async fn test_wrong_recipient() {
        let signer = PrivateKeySigner::random();
        let to = address!("1111111111111111111111111111111111111111");
        let nonce = test_nonce(0x03);

        let (mut req, payload) =
            create_test_payment(&signer, to, U256::from(1_000_000u64), 2_000_000_000, nonce).await;

        // Change pay_to to a different address
        req.pay_to = format!("{:?}", address!("2222222222222222222222222222222222222222"));

        let result = verify_payment(&req, &payload, 1_000_000);
        assert!(matches!(result, Err(AppError::BadRequest(_))));
    }

    #[tokio::test]
    async fn test_insufficient_amount() {
        let signer = PrivateKeySigner::random();
        let to = address!("1111111111111111111111111111111111111111");
        let nonce = test_nonce(0x04);

        let (mut req, payload) =
            create_test_payment(&signer, to, U256::from(500_000u64), 2_000_000_000, nonce).await;

        // Require more than was signed
        req.max_amount_required = "1000000".into();

        let result = verify_payment(&req, &payload, 1_000_000);
        assert!(matches!(result, Err(AppError::BadRequest(_))));
    }

    #[test]
    fn test_unsupported_scheme() {
        let req = PaymentRequirements {
            scheme: "permit2".into(),
            network: "base-mainnet".into(),
            max_amount_required: "1000000".into(),
            resource: "test".into(),
            description: "test".into(),
            mime_type: "".into(),
            pay_to: "0x1111111111111111111111111111111111111111".into(),
            max_timeout_seconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".into(),
            extra: serde_json::Value::Null,
        };
        let payload = PaymentPayload {
            scheme: "permit2".into(),
            network: "base-mainnet".into(),
            payload: PaymentProof {
                signature: "0x00".into(),
                authorization: crate::middleware::x402::types::TransferAuthorization {
                    from: "0x00".into(),
                    to: "0x00".into(),
                    value: "0".into(),
                    valid_after: "0".into(),
                    valid_before: "0".into(),
                    nonce: "0x00".into(),
                },
            },
        };

        let result = verify_payment(&req, &payload, 0);
        assert!(matches!(result, Err(AppError::BadRequest(_))));
    }
}

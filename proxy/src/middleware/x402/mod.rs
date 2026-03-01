//! x402 payment protocol verification.
//!
//! Parses `X-Payment-Requirements` and `X-Payment` headers (base64url JSON)
//! and verifies EIP-3009 TransferWithAuthorization signatures.

pub mod types;
pub mod verify;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

use crate::error::AppError;
use types::{PaymentPayload, PaymentRequirements};

/// Decode and parse the `X-Payment-Requirements` header value.
pub fn parse_payment_requirements(header: &str) -> Result<PaymentRequirements, AppError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(header.trim())
        .map_err(|e| AppError::BadRequest(format!("invalid base64url in X-Payment-Requirements: {e}")))?;

    serde_json::from_slice(&bytes)
        .map_err(|e| AppError::BadRequest(format!("invalid JSON in X-Payment-Requirements: {e}")))
}

/// Decode and parse the `X-Payment` header value.
pub fn parse_payment_payload(header: &str) -> Result<PaymentPayload, AppError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(header.trim())
        .map_err(|e| AppError::BadRequest(format!("invalid base64url in X-Payment: {e}")))?;

    serde_json::from_slice(&bytes)
        .map_err(|e| AppError::BadRequest(format!("invalid JSON in X-Payment: {e}")))
}

/// Encode a value as base64url JSON (for building headers in tests/forwarding).
#[allow(dead_code)]
pub fn encode_to_header<T: serde::Serialize>(value: &T) -> Result<String, AppError> {
    let json = serde_json::to_vec(value)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("failed to serialize: {e}")))?;
    Ok(URL_SAFE_NO_PAD.encode(&json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip_payment_requirements() {
        let req = PaymentRequirements {
            scheme: "exact".into(),
            network: "base-mainnet".into(),
            max_amount_required: "1000000".into(),
            resource: "https://api.example.com/data".into(),
            description: "test".into(),
            mime_type: "application/json".into(),
            pay_to: "0x1234567890abcdef1234567890abcdef12345678".into(),
            max_timeout_seconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".into(),
            extra: serde_json::Value::Null,
        };

        let encoded = encode_to_header(&req).unwrap();
        let decoded = parse_payment_requirements(&encoded).unwrap();
        assert_eq!(decoded.scheme, "exact");
        assert_eq!(decoded.max_amount_required, "1000000");
    }

    #[test]
    fn test_invalid_base64_rejected() {
        let result = parse_payment_requirements("!!!not-base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_json_rejected() {
        let encoded = URL_SAFE_NO_PAD.encode(b"not json");
        let result = parse_payment_requirements(&encoded);
        assert!(result.is_err());
    }
}

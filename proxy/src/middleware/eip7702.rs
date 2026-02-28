//! EIP-7702 session key verification middleware.
//!
//! Validates that the session key used by an agent:
//! - Has not been revoked
//! - Has not expired
//! - Is within its spend limits
//! - Target contract is in the session key's allowed list

use chrono::Utc;

use crate::error::AppError;
use crate::middleware::x402::types::VerifiedPayment;
use crate::models::session_key::SessionKey;

/// Verify a session key is valid for the given payment.
///
/// Checks are fail-closed: any ambiguity results in denial.
pub fn verify_session_key(
    key: &SessionKey,
    payment: &VerifiedPayment,
    target_contract: Option<&str>,
) -> Result<(), AppError> {
    // 1. Revocation check
    if key.is_revoked {
        return Err(AppError::Forbidden("session key has been revoked".into()));
    }

    // 2. Expiry check
    if Utc::now() >= key.expires_at {
        return Err(AppError::Forbidden("session key has expired".into()));
    }

    // 3. Spend limit check
    let payment_amount = payment
        .value
        .try_into()
        .unwrap_or(u64::MAX); // overflow → deny
    let new_total = key.spent.saturating_add(payment_amount);
    if new_total > key.max_spend {
        return Err(AppError::GuardrailViolation(format!(
            "session key spend limit exceeded: {} + {} > {}",
            key.spent, payment_amount, key.max_spend
        )));
    }

    // 4. Contract whitelist check (if session key has restrictions)
    if !key.allowed_contracts.is_empty() {
        if let Some(contract) = target_contract {
            let contract_lower = contract.to_lowercase();
            let is_allowed = key
                .allowed_contracts
                .iter()
                .any(|addr| addr.to_lowercase() == contract_lower);
            if !is_allowed {
                return Err(AppError::Forbidden(format!(
                    "session key not authorized for contract {}",
                    contract
                )));
            }
        }
        // If no target_contract provided but key has restrictions, that's ambiguous → deny
        else {
            return Err(AppError::Forbidden(
                "session key requires target contract but none specified".into(),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, B256, U256};
    use chrono::Duration;
    use uuid::Uuid;

    fn make_payment(value: u64) -> VerifiedPayment {
        VerifiedPayment {
            from: address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            to: address!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
            value: U256::from(value),
            nonce: B256::ZERO,
            network: "base-sepolia".into(),
        }
    }

    fn make_session_key(max_spend: u64, spent: u64, hours_until_expiry: i64) -> SessionKey {
        SessionKey {
            id: Uuid::new_v4(),
            agent_id: Uuid::new_v4(),
            public_key: "0xdeadbeef".into(),
            max_spend,
            spent,
            allowed_contracts: vec![],
            expires_at: Utc::now() + Duration::hours(hours_until_expiry),
            is_revoked: false,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn valid_session_key_passes() {
        let key = make_session_key(10_000_000, 0, 24);
        let payment = make_payment(1_000_000);
        assert!(verify_session_key(&key, &payment, None).is_ok());
    }

    #[test]
    fn revoked_key_rejected() {
        let mut key = make_session_key(10_000_000, 0, 24);
        key.is_revoked = true;
        let payment = make_payment(100);
        let err = verify_session_key(&key, &payment, None).unwrap_err();
        assert!(matches!(err, AppError::Forbidden(_)));
    }

    #[test]
    fn expired_key_rejected() {
        let key = make_session_key(10_000_000, 0, -1); // expired 1h ago
        let payment = make_payment(100);
        let err = verify_session_key(&key, &payment, None).unwrap_err();
        assert!(matches!(err, AppError::Forbidden(_)));
    }

    #[test]
    fn spend_limit_exceeded_rejected() {
        let key = make_session_key(1_000_000, 900_000, 24);
        let payment = make_payment(200_000); // 900k + 200k > 1M
        let err = verify_session_key(&key, &payment, None).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    #[test]
    fn spend_at_limit_passes() {
        let key = make_session_key(1_000_000, 900_000, 24);
        let payment = make_payment(100_000); // 900k + 100k = 1M exactly
        assert!(verify_session_key(&key, &payment, None).is_ok());
    }

    #[test]
    fn allowed_contract_passes() {
        let mut key = make_session_key(10_000_000, 0, 24);
        key.allowed_contracts = vec!["0xaaaa".into()];
        let payment = make_payment(100);
        assert!(verify_session_key(&key, &payment, Some("0xAAAA")).is_ok());
    }

    #[test]
    fn disallowed_contract_rejected() {
        let mut key = make_session_key(10_000_000, 0, 24);
        key.allowed_contracts = vec!["0xaaaa".into()];
        let payment = make_payment(100);
        let err = verify_session_key(&key, &payment, Some("0xbbbb")).unwrap_err();
        assert!(matches!(err, AppError::Forbidden(_)));
    }

    #[test]
    fn contract_required_but_missing_rejected() {
        let mut key = make_session_key(10_000_000, 0, 24);
        key.allowed_contracts = vec!["0xaaaa".into()];
        let payment = make_payment(100);
        let err = verify_session_key(&key, &payment, None).unwrap_err();
        assert!(matches!(err, AppError::Forbidden(_)));
    }
}

//! Guardrails engine middleware.
//!
//! Enforces configurable safety rules on every payment before forwarding.
//! All checks are fail-closed: on any error, the request is denied.

use alloy::primitives::U256;

use crate::error::AppError;
use crate::middleware::x402::types::{PaymentRequirements, VerifiedPayment};
use crate::models::guardrail::{GuardrailRule, RuleType};

/// Evaluate all active guardrail rules against a verified payment.
///
/// Returns `Ok(())` if all rules pass, or `Err(AppError::GuardrailViolation)` on the
/// first rule that fails. Empty rule set = no restrictions (pass).
///
/// # Arguments
/// * `rules` — Active guardrail rules for the agent
/// * `payment` — The verified EIP-3009 payment
/// * `requirements` — The x402 payment requirements (for extra metadata)
/// * `daily_spent` — Total USDC spent by this agent in the last 24h (minor units)
pub fn evaluate(
    rules: &[GuardrailRule],
    payment: &VerifiedPayment,
    requirements: &PaymentRequirements,
    daily_spent: u64,
) -> Result<(), AppError> {
    for rule in rules {
        if !rule.is_active {
            continue;
        }
        evaluate_single(&rule.rule_type, payment, requirements, daily_spent)?;
    }
    Ok(())
}

fn evaluate_single(
    rule: &RuleType,
    payment: &VerifiedPayment,
    requirements: &PaymentRequirements,
    daily_spent: u64,
) -> Result<(), AppError> {
    match rule {
        RuleType::MaxSpendPerTx { limit } => {
            check_max_spend_per_tx(payment.value, *limit)
        }
        RuleType::MaxSpendPerDay { limit } => {
            check_max_spend_per_day(payment.value, daily_spent, *limit)
        }
        RuleType::AllowedContracts { addresses } => {
            check_allowed_contracts(requirements, addresses)
        }
        RuleType::MaxLeverage { max } => {
            check_max_leverage(requirements, *max)
        }
        RuleType::MaxSlippage { bps } => {
            check_max_slippage(requirements, *bps)
        }
    }
}

/// Reject if payment.value > limit.
fn check_max_spend_per_tx(value: U256, limit: u64) -> Result<(), AppError> {
    let limit_u256 = U256::from(limit);
    if value > limit_u256 {
        return Err(AppError::GuardrailViolation(format!(
            "MaxSpendPerTx exceeded: payment {} > limit {}",
            value, limit
        )));
    }
    Ok(())
}

/// Reject if daily_spent + payment.value > limit.
fn check_max_spend_per_day(value: U256, daily_spent: u64, limit: u64) -> Result<(), AppError> {
    let total = U256::from(daily_spent) + value;
    let limit_u256 = U256::from(limit);
    if total > limit_u256 {
        return Err(AppError::GuardrailViolation(format!(
            "MaxSpendPerDay exceeded: daily total {} > limit {}",
            total, limit
        )));
    }
    Ok(())
}

/// Reject if the target resource is not in the allowed contracts whitelist.
/// Empty whitelist = deny all (fail-closed).
fn check_allowed_contracts(
    requirements: &PaymentRequirements,
    allowed: &[String],
) -> Result<(), AppError> {
    if allowed.is_empty() {
        return Err(AppError::GuardrailViolation(
            "AllowedContracts: empty whitelist — all targets denied".into(),
        ));
    }

    // Extract target from extra.contract or fall back to pay_to address.
    let target = requirements
        .extra
        .get("contract")
        .and_then(|v| v.as_str())
        .unwrap_or(&requirements.pay_to);

    let target_lower = target.to_lowercase();
    let is_allowed = allowed
        .iter()
        .any(|addr| addr.to_lowercase() == target_lower);

    if !is_allowed {
        return Err(AppError::GuardrailViolation(format!(
            "AllowedContracts: target {} not in whitelist",
            target
        )));
    }
    Ok(())
}

/// Reject if leverage in requirements.extra exceeds max.
/// If no leverage field present, pass (no leverage = 1x).
fn check_max_leverage(requirements: &PaymentRequirements, max: u32) -> Result<(), AppError> {
    if let Some(leverage_val) = requirements.extra.get("leverage") {
        // SECURITY [M3]: Checked u32 cast — prevents truncation bypass where
        // e.g. 4294967301 (u32::MAX + 6) would truncate to 5.
        let leverage = leverage_val
            .as_u64()
            .and_then(|v| u32::try_from(v).ok())
            .ok_or_else(|| {
                AppError::GuardrailViolation("MaxLeverage: invalid leverage value".into())
            })?;
        if leverage > max {
            return Err(AppError::GuardrailViolation(format!(
                "MaxLeverage exceeded: {} > max {}",
                leverage, max
            )));
        }
    }
    Ok(())
}

/// Reject if slippage in requirements.extra exceeds max bps.
/// If no slippage field present, pass (assume zero slippage).
fn check_max_slippage(requirements: &PaymentRequirements, max_bps: u32) -> Result<(), AppError> {
    if let Some(slippage_val) = requirements.extra.get("slippageBps") {
        // SECURITY [M3]: Checked u32 cast — prevents truncation bypass.
        let slippage = slippage_val
            .as_u64()
            .and_then(|v| u32::try_from(v).ok())
            .ok_or_else(|| {
                AppError::GuardrailViolation("MaxSlippage: invalid slippage value".into())
            })?;
        if slippage > max_bps {
            return Err(AppError::GuardrailViolation(format!(
                "MaxSlippage exceeded: {} bps > max {} bps",
                slippage, max_bps
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, B256};
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

    fn make_requirements(extra: serde_json::Value) -> PaymentRequirements {
        PaymentRequirements {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            max_amount_required: "1000000".into(),
            resource: "https://api.example.com/data".into(),
            description: String::new(),
            mime_type: String::new(),
            pay_to: "0xcccccccccccccccccccccccccccccccccccccccc".into(),
            max_timeout_seconds: 60,
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".into(),
            extra,
        }
    }

    fn make_rule(rule_type: RuleType) -> GuardrailRule {
        GuardrailRule {
            id: Uuid::new_v4(),
            agent_id: Uuid::new_v4(),
            rule_type,
            is_active: true,
        }
    }

    // --- MaxSpendPerTx ---

    #[test]
    fn max_spend_per_tx_at_limit_passes() {
        let payment = make_payment(1_000_000);
        let reqs = make_requirements(serde_json::json!({}));
        let rules = vec![make_rule(RuleType::MaxSpendPerTx { limit: 1_000_000 })];
        assert!(evaluate(&rules, &payment, &reqs, 0).is_ok());
    }

    #[test]
    fn max_spend_per_tx_over_limit_fails() {
        let payment = make_payment(1_000_001);
        let reqs = make_requirements(serde_json::json!({}));
        let rules = vec![make_rule(RuleType::MaxSpendPerTx { limit: 1_000_000 })];
        let err = evaluate(&rules, &payment, &reqs, 0).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    // --- MaxSpendPerDay ---

    #[test]
    fn max_spend_per_day_under_limit_passes() {
        let payment = make_payment(500_000);
        let reqs = make_requirements(serde_json::json!({}));
        let rules = vec![make_rule(RuleType::MaxSpendPerDay { limit: 10_000_000 })];
        assert!(evaluate(&rules, &payment, &reqs, 5_000_000).is_ok());
    }

    #[test]
    fn max_spend_per_day_over_limit_fails() {
        let payment = make_payment(500_001);
        let reqs = make_requirements(serde_json::json!({}));
        let rules = vec![make_rule(RuleType::MaxSpendPerDay { limit: 10_000_000 })];
        let err = evaluate(&rules, &payment, &reqs, 9_500_000).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    // --- AllowedContracts ---

    #[test]
    fn allowed_contracts_match_passes() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({
            "contract": "0xcccccccccccccccccccccccccccccccccccccccc"
        }));
        let rules = vec![make_rule(RuleType::AllowedContracts {
            addresses: vec!["0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".into()],
        })];
        assert!(evaluate(&rules, &payment, &reqs, 0).is_ok());
    }

    #[test]
    fn allowed_contracts_no_match_fails() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({
            "contract": "0xdddddddddddddddddddddddddddddddddddddd"
        }));
        let rules = vec![make_rule(RuleType::AllowedContracts {
            addresses: vec!["0xcccccccccccccccccccccccccccccccccccccccc".into()],
        })];
        let err = evaluate(&rules, &payment, &reqs, 0).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    #[test]
    fn allowed_contracts_empty_whitelist_denies_all() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({}));
        let rules = vec![make_rule(RuleType::AllowedContracts {
            addresses: vec![],
        })];
        let err = evaluate(&rules, &payment, &reqs, 0).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    // --- MaxLeverage ---

    #[test]
    fn max_leverage_within_limit_passes() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({ "leverage": 3 }));
        let rules = vec![make_rule(RuleType::MaxLeverage { max: 5 })];
        assert!(evaluate(&rules, &payment, &reqs, 0).is_ok());
    }

    #[test]
    fn max_leverage_over_limit_fails() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({ "leverage": 10 }));
        let rules = vec![make_rule(RuleType::MaxLeverage { max: 5 })];
        let err = evaluate(&rules, &payment, &reqs, 0).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    #[test]
    fn max_leverage_absent_passes() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({}));
        let rules = vec![make_rule(RuleType::MaxLeverage { max: 5 })];
        assert!(evaluate(&rules, &payment, &reqs, 0).is_ok());
    }

    // --- MaxSlippage ---

    #[test]
    fn max_slippage_within_limit_passes() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({ "slippageBps": 30 }));
        let rules = vec![make_rule(RuleType::MaxSlippage { bps: 50 })];
        assert!(evaluate(&rules, &payment, &reqs, 0).is_ok());
    }

    #[test]
    fn max_slippage_over_limit_fails() {
        let payment = make_payment(100);
        let reqs = make_requirements(serde_json::json!({ "slippageBps": 100 }));
        let rules = vec![make_rule(RuleType::MaxSlippage { bps: 50 })];
        let err = evaluate(&rules, &payment, &reqs, 0).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    // --- Combined rules ---

    #[test]
    fn multiple_rules_all_pass() {
        let payment = make_payment(500_000);
        let reqs = make_requirements(serde_json::json!({
            "contract": "0xcccccccccccccccccccccccccccccccccccccccc",
            "leverage": 2,
            "slippageBps": 25,
        }));
        let rules = vec![
            make_rule(RuleType::MaxSpendPerTx { limit: 1_000_000 }),
            make_rule(RuleType::MaxSpendPerDay { limit: 10_000_000 }),
            make_rule(RuleType::AllowedContracts {
                addresses: vec!["0xcccccccccccccccccccccccccccccccccccccccc".into()],
            }),
            make_rule(RuleType::MaxLeverage { max: 3 }),
            make_rule(RuleType::MaxSlippage { bps: 50 }),
        ];
        assert!(evaluate(&rules, &payment, &reqs, 2_000_000).is_ok());
    }

    #[test]
    fn multiple_rules_one_fails() {
        let payment = make_payment(2_000_000); // over tx limit
        let reqs = make_requirements(serde_json::json!({
            "contract": "0xcccccccccccccccccccccccccccccccccccccccc",
        }));
        let rules = vec![
            make_rule(RuleType::MaxSpendPerTx { limit: 1_000_000 }),
            make_rule(RuleType::AllowedContracts {
                addresses: vec!["0xcccccccccccccccccccccccccccccccccccccccc".into()],
            }),
        ];
        let err = evaluate(&rules, &payment, &reqs, 0).unwrap_err();
        assert!(matches!(err, AppError::GuardrailViolation(_)));
    }

    #[test]
    fn empty_rules_passes() {
        let payment = make_payment(999_999_999);
        let reqs = make_requirements(serde_json::json!({}));
        assert!(evaluate(&[], &payment, &reqs, 0).is_ok());
    }

    #[test]
    fn inactive_rule_skipped() {
        let payment = make_payment(2_000_000);
        let reqs = make_requirements(serde_json::json!({}));
        let mut rule = make_rule(RuleType::MaxSpendPerTx { limit: 1_000_000 });
        rule.is_active = false;
        assert!(evaluate(&[rule], &payment, &reqs, 0).is_ok());
    }
}

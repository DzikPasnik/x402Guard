use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A guardrail rule attached to an agent or session key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardrailRule {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub rule_type: RuleType,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "params")]
pub enum RuleType {
    /// Maximum spend per single transaction (USDC minor units).
    MaxSpendPerTx { limit: u64 },
    /// Maximum spend per 24h rolling window.
    MaxSpendPerDay { limit: u64 },
    /// Whitelist of allowed contract addresses.
    AllowedContracts { addresses: Vec<String> },
    /// Maximum leverage multiplier (e.g. 3 = 3x).
    MaxLeverage { max: u32 },
    /// Maximum allowed slippage in basis points (e.g. 50 = 0.5%).
    MaxSlippage { bps: u32 },
}

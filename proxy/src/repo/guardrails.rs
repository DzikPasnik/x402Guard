use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::models::guardrail::{GuardrailRule, RuleType};

/// Row type matching the database schema (rule_type + rule_params separate columns).
#[derive(Debug, FromRow)]
struct GuardrailRow {
    id: Uuid,
    agent_id: Uuid,
    rule_type: String,
    rule_params: serde_json::Value,
    is_active: bool,
    #[allow(dead_code)]
    created_at: chrono::DateTime<chrono::Utc>,
}

fn row_to_rule(row: GuardrailRow) -> Result<GuardrailRule> {
    let rule_type = match row.rule_type.as_str() {
        "MaxSpendPerTx" => {
            let limit = row.rule_params["limit"]
                .as_u64()
                .ok_or_else(|| anyhow::anyhow!("missing 'limit' in MaxSpendPerTx params"))?;
            RuleType::MaxSpendPerTx { limit }
        }
        "MaxSpendPerDay" => {
            let limit = row.rule_params["limit"]
                .as_u64()
                .ok_or_else(|| anyhow::anyhow!("missing 'limit' in MaxSpendPerDay params"))?;
            RuleType::MaxSpendPerDay { limit }
        }
        "AllowedContracts" => {
            let addresses: Vec<String> = serde_json::from_value(
                row.rule_params["addresses"].clone(),
            )
            .map_err(|e| anyhow::anyhow!("invalid 'addresses' in AllowedContracts: {e}"))?;
            RuleType::AllowedContracts { addresses }
        }
        "MaxLeverage" => {
            // SECURITY [M3]: Checked u32 cast
            let max = row.rule_params["max"]
                .as_u64()
                .and_then(|v| u32::try_from(v).ok())
                .ok_or_else(|| anyhow::anyhow!("invalid 'max' in MaxLeverage params"))?;
            RuleType::MaxLeverage { max }
        }
        "MaxSlippage" => {
            // SECURITY [M3]: Checked u32 cast
            let bps = row.rule_params["bps"]
                .as_u64()
                .and_then(|v| u32::try_from(v).ok())
                .ok_or_else(|| anyhow::anyhow!("invalid 'bps' in MaxSlippage params"))?;
            RuleType::MaxSlippage { bps }
        }
        other => anyhow::bail!("unknown rule_type: {other}"),
    };

    Ok(GuardrailRule {
        id: row.id,
        agent_id: row.agent_id,
        rule_type,
        is_active: row.is_active,
    })
}

fn rule_type_name(rt: &RuleType) -> &'static str {
    match rt {
        RuleType::MaxSpendPerTx { .. } => "MaxSpendPerTx",
        RuleType::MaxSpendPerDay { .. } => "MaxSpendPerDay",
        RuleType::AllowedContracts { .. } => "AllowedContracts",
        RuleType::MaxLeverage { .. } => "MaxLeverage",
        RuleType::MaxSlippage { .. } => "MaxSlippage",
    }
}

fn rule_type_params(rt: &RuleType) -> serde_json::Value {
    match rt {
        RuleType::MaxSpendPerTx { limit } => serde_json::json!({ "limit": limit }),
        RuleType::MaxSpendPerDay { limit } => serde_json::json!({ "limit": limit }),
        RuleType::AllowedContracts { addresses } => serde_json::json!({ "addresses": addresses }),
        RuleType::MaxLeverage { max } => serde_json::json!({ "max": max }),
        RuleType::MaxSlippage { bps } => serde_json::json!({ "bps": bps }),
    }
}

pub async fn create(pool: &PgPool, agent_id: Uuid, rule_type: &RuleType) -> Result<GuardrailRule> {
    let type_name = rule_type_name(rule_type);
    let params = rule_type_params(rule_type);

    let row: GuardrailRow = sqlx::query_as(
        "INSERT INTO guardrail_rules (agent_id, rule_type, rule_params) \
         VALUES ($1, $2, $3) \
         RETURNING id, agent_id, rule_type, rule_params, is_active, created_at",
    )
    .bind(agent_id)
    .bind(type_name)
    .bind(params)
    .fetch_one(pool)
    .await?;
    row_to_rule(row)
}

pub async fn find_active_by_agent(pool: &PgPool, agent_id: Uuid) -> Result<Vec<GuardrailRule>> {
    let rows: Vec<GuardrailRow> = sqlx::query_as(
        "SELECT id, agent_id, rule_type, rule_params, is_active, created_at \
         FROM guardrail_rules WHERE agent_id = $1 AND is_active = true",
    )
    .bind(agent_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(row_to_rule).collect()
}

#[allow(dead_code)]
pub async fn find_by_id(pool: &PgPool, rule_id: Uuid) -> Result<Option<GuardrailRule>> {
    let row: Option<GuardrailRow> = sqlx::query_as(
        "SELECT id, agent_id, rule_type, rule_params, is_active, created_at \
         FROM guardrail_rules WHERE id = $1",
    )
    .bind(rule_id)
    .fetch_optional(pool)
    .await?;

    row.map(row_to_rule).transpose()
}

/// SECURITY [H2]: Update requires both rule_id AND agent_id to prevent cross-agent access.
pub async fn update(
    pool: &PgPool,
    rule_id: Uuid,
    agent_id: Uuid,
    rule_type: &RuleType,
    is_active: bool,
) -> Result<GuardrailRule> {
    let type_name = rule_type_name(rule_type);
    let params = rule_type_params(rule_type);

    let row: Option<GuardrailRow> = sqlx::query_as(
        "UPDATE guardrail_rules SET rule_type = $3, rule_params = $4, is_active = $5 \
         WHERE id = $1 AND agent_id = $2 \
         RETURNING id, agent_id, rule_type, rule_params, is_active, created_at",
    )
    .bind(rule_id)
    .bind(agent_id)
    .bind(type_name)
    .bind(params)
    .bind(is_active)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => row_to_rule(r),
        None => anyhow::bail!("rule {} not found for agent {}", rule_id, agent_id),
    }
}

/// SECURITY [H2]: Deactivate requires both rule_id AND agent_id to prevent cross-agent access.
pub async fn deactivate(pool: &PgPool, rule_id: Uuid, agent_id: Uuid) -> Result<()> {
    let result = sqlx::query(
        "UPDATE guardrail_rules SET is_active = false WHERE id = $1 AND agent_id = $2",
    )
    .bind(rule_id)
    .bind(agent_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("rule {} not found for agent {}", rule_id, agent_id);
    }
    Ok(())
}

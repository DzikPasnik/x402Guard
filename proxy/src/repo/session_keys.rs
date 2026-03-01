use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::models::session_key::SessionKey;

/// Row type matching DB columns (allowed_contracts stored as JSONB).
#[derive(Debug, FromRow)]
struct SessionKeyRow {
    id: Uuid,
    agent_id: Uuid,
    public_key: String,
    max_spend: i64,
    spent: i64,
    allowed_contracts: serde_json::Value,
    expires_at: DateTime<Utc>,
    is_revoked: bool,
    created_at: DateTime<Utc>,
}

fn row_to_session_key(row: SessionKeyRow) -> Result<SessionKey> {
    let allowed_contracts: Vec<String> = serde_json::from_value(row.allowed_contracts)
        .map_err(|e| anyhow::anyhow!("invalid allowed_contracts JSON: {e}"))?;

    // SECURITY [C5]: Checked casts — negative DB values indicate data corruption.
    let max_spend = u64::try_from(row.max_spend)
        .map_err(|_| anyhow::anyhow!("negative max_spend {} — data corruption", row.max_spend))?;
    let spent = u64::try_from(row.spent)
        .map_err(|_| anyhow::anyhow!("negative spent {} — data corruption", row.spent))?;

    Ok(SessionKey {
        id: row.id,
        agent_id: row.agent_id,
        public_key: row.public_key,
        max_spend,
        spent,
        allowed_contracts,
        expires_at: row.expires_at,
        is_revoked: row.is_revoked,
        created_at: row.created_at,
    })
}

pub async fn create(
    pool: &PgPool,
    agent_id: Uuid,
    public_key: &str,
    max_spend: u64,
    allowed_contracts: &[String],
    expires_at: DateTime<Utc>,
) -> Result<SessionKey> {
    let contracts_json = serde_json::to_value(allowed_contracts)?;

    let row: SessionKeyRow = sqlx::query_as(
        "INSERT INTO session_keys (agent_id, public_key, max_spend, allowed_contracts, expires_at) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, agent_id, public_key, max_spend, spent, allowed_contracts, expires_at, is_revoked, created_at",
    )
    .bind(agent_id)
    .bind(public_key)
    .bind(i64::try_from(max_spend).map_err(|_| anyhow::anyhow!("max_spend exceeds i64::MAX"))?)
    .bind(contracts_json)
    .bind(expires_at)
    .fetch_one(pool)
    .await?;
    row_to_session_key(row)
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<SessionKey>> {
    let row: Option<SessionKeyRow> = sqlx::query_as(
        "SELECT id, agent_id, public_key, max_spend, spent, allowed_contracts, expires_at, is_revoked, created_at \
         FROM session_keys WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    row.map(row_to_session_key).transpose()
}

pub async fn find_active_by_agent(pool: &PgPool, agent_id: Uuid) -> Result<Vec<SessionKey>> {
    let rows: Vec<SessionKeyRow> = sqlx::query_as(
        "SELECT id, agent_id, public_key, max_spend, spent, allowed_contracts, expires_at, is_revoked, created_at \
         FROM session_keys WHERE agent_id = $1 AND is_revoked = false ORDER BY created_at DESC",
    )
    .bind(agent_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(row_to_session_key).collect()
}

pub async fn increment_spent(pool: &PgPool, id: Uuid, amount: u64) -> Result<()> {
    let result = sqlx::query(
        "UPDATE session_keys SET spent = spent + $2 \
         WHERE id = $1 AND is_revoked = false AND spent + $2 <= max_spend",
    )
    .bind(id)
    .bind(i64::try_from(amount).map_err(|_| anyhow::anyhow!("amount exceeds i64::MAX"))?)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("session key spend limit exceeded or key revoked");
    }
    Ok(())
}

/// SECURITY [H2]: Revoke requires both key_id AND agent_id to prevent cross-agent access.
pub async fn revoke(pool: &PgPool, id: Uuid, agent_id: Uuid) -> Result<()> {
    let result = sqlx::query(
        "UPDATE session_keys SET is_revoked = true WHERE id = $1 AND agent_id = $2",
    )
    .bind(id)
    .bind(agent_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("session key {} not found for agent {}", id, agent_id);
    }
    Ok(())
}

/// Revoke ALL active session keys for the given agent in a single atomic UPDATE.
///
/// Returns the number of keys that were actually revoked (i.e., transitioned
/// from `is_revoked = false` to `is_revoked = true`). Idempotent: calling
/// again returns 0.
///
/// SECURITY: This runs inside the caller's transaction when used from the
/// revoke-all endpoint, ensuring atomicity with agent deactivation.
#[allow(dead_code)]
pub async fn revoke_all_by_agent(pool: &PgPool, agent_id: Uuid) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE session_keys SET is_revoked = true WHERE agent_id = $1 AND is_revoked = false",
    )
    .bind(agent_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// Revoke ALL active session keys for the given agent using a transactional executor.
///
/// Same as `revoke_all_by_agent` but accepts any sqlx Executor (e.g., a transaction)
/// so callers can compose this with other writes atomically.
pub async fn revoke_all_by_agent_tx<'e, E>(executor: E, agent_id: Uuid) -> Result<u64>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    let result = sqlx::query(
        "UPDATE session_keys SET is_revoked = true WHERE agent_id = $1 AND is_revoked = false",
    )
    .bind(agent_id)
    .execute(executor)
    .await?;

    Ok(result.rows_affected())
}

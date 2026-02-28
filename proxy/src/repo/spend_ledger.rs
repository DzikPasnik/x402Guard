use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn record_spend(
    pool: &PgPool,
    agent_id: Uuid,
    session_key_id: Option<Uuid>,
    amount: u64,
    tx_nonce: &str,
) -> Result<()> {
    // SECURITY [C5]: Checked cast — reject amounts that overflow i64.
    // This is defense-in-depth; the proxy handler already validates u64 bounds.
    let amount_i64 = i64::try_from(amount)
        .map_err(|_| anyhow::anyhow!("spend amount {} exceeds i64::MAX", amount))?;

    sqlx::query(
        "INSERT INTO spend_ledger (agent_id, session_key_id, amount, tx_nonce) \
         VALUES ($1, $2, $3, $4)",
    )
    .bind(agent_id)
    .bind(session_key_id)
    .bind(amount_i64)
    .bind(tx_nonce)
    .execute(pool)
    .await?;
    Ok(())
}

/// Sum all spend for an agent in the last 24 hours (rolling window).
pub async fn sum_last_24h(pool: &PgPool, agent_id: Uuid) -> Result<u64> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(amount), 0) FROM spend_ledger \
         WHERE agent_id = $1 AND created_at > now() - interval '24 hours'",
    )
    .bind(agent_id)
    .fetch_one(pool)
    .await?;

    // SECURITY [C5]: Checked cast — negative sums indicate data corruption.
    u64::try_from(row.0)
        .map_err(|_| anyhow::anyhow!("negative spend sum {} — possible data corruption", row.0))
}

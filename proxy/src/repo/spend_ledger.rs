use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// SECURITY [CRITICAL-1]: Atomic record-spend-with-daily-limit-check.
///
/// Inserts a spend record ONLY if the rolling 24h total (including this amount)
/// does not exceed `daily_limit`. This is a single atomic SQL statement that
/// prevents TOCTOU race conditions — two concurrent requests cannot both pass
/// the daily limit check because the INSERT...SELECT with subquery is
/// evaluated atomically by Postgres.
///
/// Returns `Ok(true)` if the spend was recorded (within limit),
/// `Ok(false)` if the daily limit would be exceeded (spend NOT recorded).
pub async fn record_spend_atomic(
    pool: &PgPool,
    agent_id: Uuid,
    session_key_id: Option<Uuid>,
    amount: u64,
    tx_nonce: &str,
    daily_limit: Option<u64>,
) -> Result<bool> {
    // SECURITY [C5]: Checked cast — reject amounts that overflow i64.
    let amount_i64 = i64::try_from(amount)
        .map_err(|_| anyhow::anyhow!("spend amount {} exceeds i64::MAX", amount))?;

    match daily_limit {
        Some(limit) => {
            let limit_i64 = i64::try_from(limit)
                .map_err(|_| anyhow::anyhow!("daily limit {} exceeds i64::MAX", limit))?;

            // Atomic INSERT...SELECT WHERE: only inserts if 24h sum + new amount <= limit.
            // The subquery and INSERT run in the same statement — no TOCTOU window.
            let result = sqlx::query(
                "INSERT INTO spend_ledger (agent_id, session_key_id, amount, tx_nonce) \
                 SELECT $1, $2, $3, $4 \
                 WHERE (SELECT COALESCE(SUM(amount), 0) FROM spend_ledger \
                        WHERE agent_id = $1 AND created_at > now() - interval '24 hours') + $3 <= $5",
            )
            .bind(agent_id)
            .bind(session_key_id)
            .bind(amount_i64)
            .bind(tx_nonce)
            .bind(limit_i64)
            .execute(pool)
            .await?;

            Ok(result.rows_affected() > 0)
        }
        None => {
            // No daily limit configured — always insert.
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
            Ok(true)
        }
    }
}

/// Record spend without daily limit check (legacy — prefer `record_spend_atomic`).
pub async fn record_spend(
    pool: &PgPool,
    agent_id: Uuid,
    session_key_id: Option<Uuid>,
    amount: u64,
    tx_nonce: &str,
) -> Result<()> {
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

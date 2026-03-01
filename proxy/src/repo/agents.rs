use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::models::agent::Agent;

// Agent already derives Serialize/Deserialize; add FromRow for sqlx runtime queries.
// We use a shadow row type to avoid adding sqlx dependency to the model.

#[derive(Debug, FromRow)]
struct AgentRow {
    id: Uuid,
    name: String,
    owner_address: String,
    is_active: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<AgentRow> for Agent {
    fn from(r: AgentRow) -> Self {
        Self { id: r.id, name: r.name, owner_address: r.owner_address, is_active: r.is_active, created_at: r.created_at }
    }
}

pub async fn create(pool: &PgPool, name: &str, owner_address: &str) -> Result<Agent> {
    let row: AgentRow = sqlx::query_as(
        "INSERT INTO agents (name, owner_address) VALUES ($1, $2) \
         RETURNING id, name, owner_address, is_active, created_at",
    )
    .bind(name)
    .bind(owner_address)
    .fetch_one(pool)
    .await?;
    Ok(row.into())
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Agent>> {
    let row: Option<AgentRow> = sqlx::query_as(
        "SELECT id, name, owner_address, is_active, created_at FROM agents WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(Into::into))
}

pub async fn find_by_owner(pool: &PgPool, owner_address: &str) -> Result<Option<Agent>> {
    let row: Option<AgentRow> = sqlx::query_as(
        "SELECT id, name, owner_address, is_active, created_at FROM agents WHERE owner_address = $1",
    )
    .bind(owner_address)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(Into::into))
}

/// Deactivate an agent. Idempotent: succeeds even if already inactive.
///
/// Returns an error only if the agent does not exist (0 rows affected
/// AND agent not found). This prevents silent no-ops on typo'd UUIDs.
pub async fn deactivate(pool: &PgPool, agent_id: Uuid) -> Result<()> {
    let result = sqlx::query(
        "UPDATE agents SET is_active = false WHERE id = $1",
    )
    .bind(agent_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("agent {} not found", agent_id);
    }
    Ok(())
}

/// Deactivate an agent using a transactional executor.
///
/// Same as `deactivate` but accepts any sqlx Executor so callers can
/// compose this with other writes atomically (e.g., revoke-all endpoint).
pub async fn deactivate_tx<'e, E>(executor: E, agent_id: Uuid) -> Result<()>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    let result = sqlx::query(
        "UPDATE agents SET is_active = false WHERE id = $1",
    )
    .bind(agent_id)
    .execute(executor)
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("agent {} not found", agent_id);
    }
    Ok(())
}

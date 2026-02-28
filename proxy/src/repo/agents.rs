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

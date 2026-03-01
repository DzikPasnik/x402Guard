//! Audit log repository — append-only INSERT operations.
//!
//! No UPDATE or DELETE functions exist by design. The database trigger
//! enforces immutability, but we also enforce it at the application layer
//! by simply not providing mutation functions.

use anyhow::Result;
use sqlx::PgPool;

use crate::models::audit_event::AuditEvent;

/// Insert a single audit event into the immutable audit log.
pub async fn insert_event(pool: &PgPool, event: &AuditEvent) -> Result<()> {
    sqlx::query(
        "INSERT INTO audit_log (agent_id, session_key_id, event_type, metadata) \
         VALUES ($1, $2, $3, $4)",
    )
    .bind(event.agent_id)
    .bind(event.session_key_id)
    .bind(event.event_type.as_str())
    .bind(&event.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

/// Insert a batch of audit events. Each event is inserted individually
/// within the same logical call. This keeps the implementation simple
/// and reliable — no complex batch SQL needed for the expected throughput.
pub async fn insert_batch(pool: &PgPool, events: &[AuditEvent]) -> Result<()> {
    for event in events {
        insert_event(pool, event).await?;
    }
    Ok(())
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Represents a registered agent that uses x402Guard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub name: String,
    pub owner_address: String,
    pub created_at: DateTime<Utc>,
    pub is_active: bool,
}

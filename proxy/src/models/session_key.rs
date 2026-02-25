use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// EIP-7702 session key with scoped permissions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionKey {
    pub id: Uuid,
    pub agent_id: Uuid,
    /// The delegated public key (hex-encoded).
    pub public_key: String,
    /// Maximum spend allowed in this session (in USDC minor units).
    pub max_spend: u64,
    /// Amount already spent in this session.
    pub spent: u64,
    /// Contracts this key is allowed to interact with.
    pub allowed_contracts: Vec<String>,
    /// When this session key expires.
    pub expires_at: DateTime<Utc>,
    /// Whether the key has been revoked.
    pub is_revoked: bool,
    pub created_at: DateTime<Utc>,
}

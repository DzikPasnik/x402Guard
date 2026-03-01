//! Session key CRUD endpoints + revoke-all.

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::audit_event::{AuditEvent, AuditEventType};
use crate::models::session_key::SessionKey;
use crate::repo;
use crate::services::revocation;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateSessionKeyRequest {
    pub public_key: String,
    pub max_spend: u64,
    pub allowed_contracts: Vec<String>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SessionKeyResponse {
    pub success: bool,
    pub data: Option<SessionKey>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionKeysListResponse {
    pub success: bool,
    pub data: Vec<SessionKey>,
}

/// Request body for the revoke-all endpoint.
///
/// SECURITY [H2]: `owner_address` is required to prove ownership.
/// The caller must know both the agent_id (path) and the owner_address (body).
#[derive(Debug, Deserialize)]
pub struct RevokeAllRequest {
    pub owner_address: String,
    /// Optional chain ID for EIP-7702 authorization data (defaults to Base Mainnet 8453).
    pub chain_id: Option<u64>,
    /// Optional EOA nonce hint. If omitted, the client fetches it from RPC.
    pub eoa_nonce_hint: Option<u64>,
}

/// Response for the revoke-all endpoint.
#[derive(Debug, Serialize, Deserialize)]
pub struct RevokeAllResponse {
    pub success: bool,
    /// Number of session keys that were revoked (transitioned from active to revoked).
    pub keys_revoked: u64,
    /// Whether the agent was deactivated (always true on success).
    pub agent_deactivated: bool,
    /// Unsigned EIP-7702 authorization data for client-side on-chain revocation.
    /// The proxy NEVER signs this --- the user/dashboard must sign with their EOA key.
    pub on_chain_authorization: Option<serde_json::Value>,
}

async fn create_session_key(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
    Json(req): Json<CreateSessionKeyRequest>,
) -> Result<Json<SessionKeyResponse>, AppError> {
    if req.public_key.is_empty() {
        return Err(AppError::BadRequest("public_key is required".into()));
    }
    if req.max_spend == 0 {
        return Err(AppError::BadRequest("max_spend must be > 0".into()));
    }
    if req.expires_at <= Utc::now() {
        return Err(AppError::BadRequest("expires_at must be in the future".into()));
    }

    // Verify agent exists
    repo::agents::find_by_id(&state.db, agent_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::NotFound(format!("agent {} not found", agent_id)))?;

    let key = repo::session_keys::create(
        &state.db,
        agent_id,
        &req.public_key,
        req.max_spend,
        &req.allowed_contracts,
        req.expires_at,
    )
    .await
    .map_err(AppError::Internal)?;

    // AUDIT: SessionKeyCreated — log public key and limits (no secrets).
    state.audit.emit(AuditEvent {
        agent_id: Some(agent_id),
        session_key_id: Some(key.id),
        event_type: AuditEventType::SessionKeyCreated,
        metadata: serde_json::json!({
            "public_key": req.public_key,
            "max_spend": req.max_spend,
            "expires_at": req.expires_at.to_rfc3339(),
        }),
    });

    Ok(Json(SessionKeyResponse {
        success: true,
        data: Some(key),
        error: None,
    }))
}

async fn list_session_keys(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
) -> Result<Json<SessionKeysListResponse>, AppError> {
    let keys = repo::session_keys::find_active_by_agent(&state.db, agent_id)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(SessionKeysListResponse {
        success: true,
        data: keys,
    }))
}

async fn get_session_key(
    State(state): State<AppState>,
    Path((agent_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<SessionKeyResponse>, AppError> {
    let key = repo::session_keys::find_by_id(&state.db, key_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::NotFound(format!("session key {} not found", key_id)))?;

    // SECURITY [H2]: Verify the session key belongs to the requested agent.
    if key.agent_id != agent_id {
        return Err(AppError::NotFound(format!("session key {} not found", key_id)));
    }

    Ok(Json(SessionKeyResponse {
        success: true,
        data: Some(key),
        error: None,
    }))
}

async fn revoke_session_key(
    State(state): State<AppState>,
    Path((agent_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<SessionKeyResponse>, AppError> {
    // SECURITY [H2]: Pass agent_id to prevent cross-agent key revocation.
    repo::session_keys::revoke(&state.db, key_id, agent_id)
        .await
        .map_err(AppError::Internal)?;

    // AUDIT: SessionKeyRevoked
    state.audit.emit(AuditEvent {
        agent_id: Some(agent_id),
        session_key_id: Some(key_id),
        event_type: AuditEventType::SessionKeyRevoked,
        metadata: serde_json::json!({}),
    });

    Ok(Json(SessionKeyResponse {
        success: true,
        data: None,
        error: None,
    }))
}

/// Revoke ALL session keys for an agent and deactivate the agent.
///
/// SECURITY [H2]: Requires owner_address in the request body to prove
/// ownership. The caller must know both the agent_id (URL path) AND the
/// owner_address. Returns 401 if the owner_address does not match.
///
/// ATOMICITY: The key revocation and agent deactivation run in a single
/// sqlx transaction. Either both succeed or neither does.
///
/// NON-CUSTODIAL: The response includes unsigned EIP-7702 authorization
/// data. The proxy never signs on-chain transactions.
async fn revoke_all(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
    Json(req): Json<RevokeAllRequest>,
) -> Result<Json<RevokeAllResponse>, AppError> {
    if req.owner_address.is_empty() {
        return Err(AppError::BadRequest("owner_address is required".into()));
    }

    // 1. Verify agent exists.
    let agent = repo::agents::find_by_id(&state.db, agent_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::NotFound(format!("agent {} not found", agent_id)))?;

    // 2. SECURITY [H2]: Verify caller owns the agent.
    //    Case-insensitive comparison for Ethereum addresses (mixed-case checksums).
    if !agent.owner_address.eq_ignore_ascii_case(&req.owner_address) {
        return Err(AppError::Unauthorized(
            "owner_address does not match agent owner".into(),
        ));
    }

    // 3. Atomic transaction: revoke all keys + deactivate agent.
    let mut tx = state.db.begin().await.map_err(|e| AppError::Internal(e.into()))?;

    let keys_revoked = repo::session_keys::revoke_all_by_agent_tx(&mut *tx, agent_id)
        .await
        .map_err(AppError::Internal)?;

    repo::agents::deactivate_tx(&mut *tx, agent_id)
        .await
        .map_err(AppError::Internal)?;

    tx.commit().await.map_err(|e| AppError::Internal(e.into()))?;

    // 4. AUDIT: Emit AllSessionKeysRevoked AFTER successful commit.
    //    SECURITY: Audit event cannot be suppressed --- emitted before returning.
    state.audit.emit(AuditEvent {
        agent_id: Some(agent_id),
        session_key_id: None,
        event_type: AuditEventType::AllSessionKeysRevoked,
        metadata: serde_json::json!({
            "keys_revoked": keys_revoked,
            "owner_address": req.owner_address,
        }),
    });

    // 5. Also emit AgentDeactivated for completeness.
    state.audit.emit(AuditEvent {
        agent_id: Some(agent_id),
        session_key_id: None,
        event_type: AuditEventType::AgentDeactivated,
        metadata: serde_json::json!({
            "triggered_by": "revoke_all",
        }),
    });

    // 6. Generate unsigned EIP-7702 authorization data.
    let chain_id = req.chain_id.unwrap_or(8453); // Default: Base Mainnet
    let auth_data = revocation::create_revoke_authorization_data(chain_id, req.eoa_nonce_hint);

    Ok(Json(RevokeAllResponse {
        success: true,
        keys_revoked,
        agent_deactivated: true,
        on_chain_authorization: Some(auth_data),
    }))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/agents/{agent_id}/session-keys",
            post(create_session_key).get(list_session_keys),
        )
        .route(
            "/agents/{agent_id}/session-keys/{key_id}",
            get(get_session_key).delete(revoke_session_key),
        )
        .route(
            "/agents/{agent_id}/revoke-all",
            post(revoke_all),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- RevokeAllResponse serialization tests ---

    #[test]
    fn revoke_all_response_serializes_correctly() {
        let auth_data = serde_json::json!({
            "chain_id": 8453,
            "address": "0x0000000000000000000000000000000000000000",
            "nonce": null,
            "message": "Sign to revoke all EIP-7702 delegation for this EOA"
        });

        let response = RevokeAllResponse {
            success: true,
            keys_revoked: 5,
            agent_deactivated: true,
            on_chain_authorization: Some(auth_data),
        };

        let json = serde_json::to_value(&response).expect("serialization should succeed");
        assert_eq!(json["success"], true);
        assert_eq!(json["keys_revoked"], 5);
        assert_eq!(json["agent_deactivated"], true);
        assert!(json["on_chain_authorization"].is_object());
        assert_eq!(
            json["on_chain_authorization"]["chain_id"],
            8453
        );
        assert_eq!(
            json["on_chain_authorization"]["address"],
            "0x0000000000000000000000000000000000000000"
        );
    }

    #[test]
    fn revoke_all_response_with_zero_keys() {
        let response = RevokeAllResponse {
            success: true,
            keys_revoked: 0,
            agent_deactivated: true,
            on_chain_authorization: Some(serde_json::json!({})),
        };

        let json = serde_json::to_value(&response).expect("serialization should succeed");
        assert_eq!(json["keys_revoked"], 0);
        assert_eq!(json["agent_deactivated"], true);
    }

    #[test]
    fn revoke_all_response_roundtrip() {
        let auth_data = crate::services::revocation::create_revoke_authorization_data(
            84532,
            Some(42),
        );

        let response = RevokeAllResponse {
            success: true,
            keys_revoked: 3,
            agent_deactivated: true,
            on_chain_authorization: Some(auth_data),
        };

        // Serialize and deserialize to verify the shape is correct.
        let json_str = serde_json::to_string(&response).expect("serialize");
        let deserialized: RevokeAllResponse =
            serde_json::from_str(&json_str).expect("deserialize");

        assert!(deserialized.success);
        assert_eq!(deserialized.keys_revoked, 3);
        assert!(deserialized.agent_deactivated);

        let auth = deserialized.on_chain_authorization.unwrap();
        assert_eq!(auth["chain_id"], 84532);
        assert_eq!(auth["nonce"], 42);
    }

    #[test]
    fn revoke_all_request_deserializes_minimal() {
        let json = r#"{"owner_address": "0xABCDEF1234567890ABCDEF1234567890ABCDEF12"}"#;
        let req: RevokeAllRequest = serde_json::from_str(json).expect("deserialize");

        assert_eq!(req.owner_address, "0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
        assert!(req.chain_id.is_none());
        assert!(req.eoa_nonce_hint.is_none());
    }

    #[test]
    fn revoke_all_request_deserializes_full() {
        let json = r#"{
            "owner_address": "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
            "chain_id": 84532,
            "eoa_nonce_hint": 7
        }"#;
        let req: RevokeAllRequest = serde_json::from_str(json).expect("deserialize");

        assert_eq!(req.owner_address, "0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
        assert_eq!(req.chain_id, Some(84532));
        assert_eq!(req.eoa_nonce_hint, Some(7));
    }

    #[test]
    fn revoke_all_response_without_authorization() {
        let response = RevokeAllResponse {
            success: true,
            keys_revoked: 1,
            agent_deactivated: true,
            on_chain_authorization: None,
        };

        let json = serde_json::to_value(&response).expect("serialization should succeed");
        assert!(json["on_chain_authorization"].is_null());
    }
}

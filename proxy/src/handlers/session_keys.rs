//! Session key CRUD endpoints.

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
        .map_err(|e| AppError::Internal(e))?
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
    .map_err(|e| AppError::Internal(e))?;

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
        .map_err(|e| AppError::Internal(e))?;

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
        .map_err(|e| AppError::Internal(e))?
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
        .map_err(|e| AppError::Internal(e))?;

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
}

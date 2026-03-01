//! Agent CRUD endpoints.

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::agent::Agent;
use crate::models::audit_event::{AuditEvent, AuditEventType};
use crate::repo;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateAgentRequest {
    pub name: String,
    pub owner_address: String,
}

#[derive(Debug, Serialize)]
pub struct AgentResponse {
    pub success: bool,
    pub data: Option<Agent>,
    pub error: Option<String>,
}

async fn create_agent(
    State(state): State<AppState>,
    Json(req): Json<CreateAgentRequest>,
) -> Result<Json<AgentResponse>, AppError> {
    if req.name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }
    if req.owner_address.is_empty() {
        return Err(AppError::BadRequest("owner_address is required".into()));
    }

    let agent = repo::agents::create(&state.db, &req.name, &req.owner_address)
        .await
        .map_err(AppError::Internal)?;

    // AUDIT: AgentCreated — log name and owner address (public info, no secrets).
    state.audit.emit(AuditEvent {
        agent_id: Some(agent.id),
        session_key_id: None,
        event_type: AuditEventType::AgentCreated,
        metadata: serde_json::json!({
            "name": agent.name,
            "owner_address": agent.owner_address,
        }),
    });

    Ok(Json(AgentResponse {
        success: true,
        data: Some(agent),
        error: None,
    }))
}

async fn get_agent(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<AgentResponse>, AppError> {
    let agent = repo::agents::find_by_id(&state.db, id)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::NotFound(format!("agent {} not found", id)))?;

    Ok(Json(AgentResponse {
        success: true,
        data: Some(agent),
        error: None,
    }))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/agents", post(create_agent))
        .route("/agents/{id}", get(get_agent))
}

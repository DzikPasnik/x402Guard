//! Guardrail rule CRUD endpoints.

use axum::extract::{Path, State};
use axum::routing::{post, put};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::guardrail::{GuardrailRule, RuleType};
use crate::repo;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateRuleRequest {
    pub rule_type: RuleType,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub rule_type: RuleType,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct RuleResponse {
    pub success: bool,
    pub data: Option<GuardrailRule>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RulesListResponse {
    pub success: bool,
    pub data: Vec<GuardrailRule>,
}

async fn create_rule(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
    Json(req): Json<CreateRuleRequest>,
) -> Result<Json<RuleResponse>, AppError> {
    // Verify agent exists
    repo::agents::find_by_id(&state.db, agent_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::NotFound(format!("agent {} not found", agent_id)))?;

    let rule = repo::guardrails::create(&state.db, agent_id, &req.rule_type)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(RuleResponse {
        success: true,
        data: Some(rule),
        error: None,
    }))
}

async fn list_rules(
    State(state): State<AppState>,
    Path(agent_id): Path<Uuid>,
) -> Result<Json<RulesListResponse>, AppError> {
    let rules = repo::guardrails::find_active_by_agent(&state.db, agent_id)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(RulesListResponse {
        success: true,
        data: rules,
    }))
}

async fn update_rule_with_body(
    State(state): State<AppState>,
    Path((agent_id, rule_id)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdateRuleRequest>,
) -> Result<Json<RuleResponse>, AppError> {
    // SECURITY [H2]: Pass agent_id to prevent cross-agent rule modification.
    let rule = repo::guardrails::update(&state.db, rule_id, agent_id, &req.rule_type, req.is_active)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(RuleResponse {
        success: true,
        data: Some(rule),
        error: None,
    }))
}

async fn deactivate_rule(
    State(state): State<AppState>,
    Path((agent_id, rule_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<RuleResponse>, AppError> {
    // SECURITY [H2]: Pass agent_id to prevent cross-agent rule deactivation.
    repo::guardrails::deactivate(&state.db, rule_id, agent_id)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(RuleResponse {
        success: true,
        data: None,
        error: None,
    }))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/agents/{agent_id}/rules", post(create_rule).get(list_rules))
        .route(
            "/agents/{agent_id}/rules/{rule_id}",
            put(update_rule_with_body).delete(deactivate_rule),
        )
}

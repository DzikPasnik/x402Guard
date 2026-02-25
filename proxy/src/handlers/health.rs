use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: &'static str,
    service: &'static str,
    redis: &'static str,
}

async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let redis_ok = check_redis(&state.redis).await;

    let status = if redis_ok { "ok" } else { "degraded" };
    let redis_status = if redis_ok { "connected" } else { "disconnected" };

    (
        StatusCode::OK,
        Json(HealthResponse {
            status: status.into(),
            version: env!("CARGO_PKG_VERSION"),
            service: "x402guard-proxy",
            redis: redis_status,
        }),
    )
}

async fn check_redis(client: &redis::Client) -> bool {
    let conn = client.get_multiplexed_tokio_connection().await;
    match conn {
        Ok(mut c) => redis::cmd("PING")
            .query_async::<String>(&mut c)
            .await
            .is_ok(),
        Err(_) => false,
    }
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}

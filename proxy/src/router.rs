use axum::extract::DefaultBodyLimit;
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::handlers;
use crate::state::AppState;

/// Maximum request body size (256 KB).
/// x402 proxy requests should be small — just base64-encoded headers.
/// This prevents memory exhaustion from oversized payloads.
const MAX_BODY_SIZE: usize = 256 * 1024;

/// Build the application router with all middleware layers.
pub fn create_router(state: AppState) -> Router {
    let api_routes = Router::new()
        .merge(handlers::health::routes())
        .merge(handlers::proxy::routes())
        .merge(handlers::agents::routes())
        .merge(handlers::guardrail_rules::routes())
        .merge(handlers::session_keys::routes());

    // Parse allowed origins from config (comma-separated).
    // SECURITY: If ALLOWED_ORIGINS is not set, default to localhost only (fail-closed).
    // Never fall back to permissive CORS in production.
    let allowed_origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:3000".into());
    let origins: Vec<_> = allowed_origins
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    let cors = if origins.is_empty() {
        tracing::warn!("ALLOWED_ORIGINS is empty or all unparseable — defaulting to localhost only");
        CorsLayer::new().allow_origin(AllowOrigin::exact(
            "http://localhost:3000".parse().expect("valid origin"),
        ))
    } else {
        CorsLayer::new().allow_origin(AllowOrigin::list(origins))
    };

    Router::new()
        .nest("/api/v1", api_routes)
        .layer(DefaultBodyLimit::max(MAX_BODY_SIZE))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

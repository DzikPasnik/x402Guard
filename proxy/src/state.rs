//! Shared application state passed through Axum's state mechanism.

use crate::config::AppConfig;

/// Shared state available to all handlers and middleware.
#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub redis: redis::Client,
    pub http_client: reqwest::Client,
}

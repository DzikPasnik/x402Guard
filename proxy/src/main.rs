use std::net::SocketAddr;
use std::time::Duration;

use anyhow::Context;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod router;
mod state;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target(true)
        .json()
        .init();

    let config = config::AppConfig::from_env().context("failed to load configuration")?;

    let redis = middleware::rate_limit::create_redis_client(&config.redis_url)
        .await
        .context("Redis connection failed")?;
    info!("Redis connected");

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .context("failed to build HTTP client")?;

    let app_state = state::AppState {
        config: config.clone(),
        redis,
        http_client,
    };

    let addr = SocketAddr::new(config.host, config.port);
    let app = router::create_router(app_state);

    let listener = TcpListener::bind(addr)
        .await
        .context("failed to bind TCP listener")?;

    info!(
        %addr,
        rate_limit_rps = config.rate_limit_rps,
        "x402Guard proxy starting"
    );

    axum::serve(listener, app)
        .await
        .context("server error")?;

    Ok(())
}

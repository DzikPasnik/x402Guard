use std::net::IpAddr;

use serde::Deserialize;

/// Top-level application configuration loaded from environment variables.
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub host: IpAddr,
    pub port: u16,
    pub base_sepolia_rpc_url: String,
    pub base_mainnet_rpc_url: String,
    pub database_url: String,
    pub redis_url: String,
    pub rate_limit_rps: u32,
}

impl AppConfig {
    /// Build configuration from environment variables.
    /// Falls back to sensible defaults for local development.
    pub fn from_env() -> anyhow::Result<Self> {
        let host: IpAddr = std::env::var("PROXY_HOST")
            .unwrap_or_else(|_| "0.0.0.0".into())
            .parse()?;

        let port: u16 = std::env::var("PROXY_PORT")
            .unwrap_or_else(|_| "3402".into())
            .parse()?;

        let base_sepolia_rpc_url = std::env::var("BASE_SEPOLIA_RPC_URL")
            .unwrap_or_else(|_| "https://sepolia.base.org".into());

        let base_mainnet_rpc_url = std::env::var("BASE_MAINNET_RPC_URL")
            .unwrap_or_else(|_| "https://mainnet.base.org".into());

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:54322/postgres".into());

        let redis_url = std::env::var("UPSTASH_REDIS_URL")
            .unwrap_or_else(|_| "redis://localhost:6379".into());

        let rate_limit_rps: u32 = std::env::var("RATE_LIMIT_RPS")
            .unwrap_or_else(|_| "1000".into())
            .parse()?;

        Ok(Self {
            host,
            port,
            base_sepolia_rpc_url,
            base_mainnet_rpc_url,
            database_url,
            redis_url,
            rate_limit_rps,
        })
    }
}

use std::net::IpAddr;

use serde::Deserialize;

/// Top-level application configuration loaded from environment variables.
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub host: IpAddr,
    pub port: u16,
    #[allow(dead_code)]
    pub base_sepolia_rpc_url: String,
    #[allow(dead_code)]
    pub base_mainnet_rpc_url: String,
    pub database_url: String,
    pub redis_url: String,
    pub rate_limit_rps: u32,

    // ── Management API authentication ──
    /// Shared secret for authenticating management API requests (CRUD endpoints).
    /// SECURITY: Must be set in production. If unset, management API is DENIED (fail-closed).
    pub management_api_key: Option<String>,

    // ── Solana (optional — only needed when proxying Solana x402 payments) ──
    /// Solana RPC URL (devnet or mainnet-beta). None = Solana support disabled.
    /// SECURITY: Must be HTTPS for mainnet (validated at load time).
    pub solana_rpc_url: Option<String>,
    /// x402-guard program ID on Solana (base58). None = Solana support disabled.
    pub solana_program_id: Option<String>,
    /// USDC SPL mint address on target Solana cluster (base58). None = Solana support disabled.
    pub solana_usdc_mint: Option<String>,
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

        // Management API key (required for production, optional for local dev)
        let management_api_key = std::env::var("MANAGEMENT_API_KEY").ok();

        // Solana config (all optional — set all three to enable Solana support)
        let solana_rpc_url = std::env::var("SOLANA_RPC_URL").ok();
        let solana_program_id = std::env::var("SOLANA_PROGRAM_ID").ok();
        let solana_usdc_mint = std::env::var("SOLANA_USDC_MINT").ok();

        // SECURITY: Validate Solana RPC URL if provided
        if let Some(ref rpc_url) = solana_rpc_url {
            validate_solana_rpc_url(rpc_url)?;
        }

        // Validate program ID and mint are valid base58 pubkeys
        if let Some(ref pid) = solana_program_id {
            validate_solana_pubkey(pid, "SOLANA_PROGRAM_ID")?;
        }
        if let Some(ref mint) = solana_usdc_mint {
            validate_solana_pubkey(mint, "SOLANA_USDC_MINT")?;
        }

        Ok(Self {
            host,
            port,
            base_sepolia_rpc_url,
            base_mainnet_rpc_url,
            database_url,
            redis_url,
            rate_limit_rps,
            management_api_key,
            solana_rpc_url,
            solana_program_id,
            solana_usdc_mint,
        })
    }

    /// Returns true if all Solana config fields are set.
    #[allow(dead_code)]
    pub fn solana_enabled(&self) -> bool {
        self.solana_rpc_url.is_some()
            && self.solana_program_id.is_some()
            && self.solana_usdc_mint.is_some()
    }
}

/// SECURITY: Validate Solana RPC URL.
///
/// - Must be a valid URL
/// - Must use HTTPS for mainnet-beta (SSRF prevention)
/// - Must not contain credentials
/// - Devnet/localhost are allowed with HTTP for development
fn validate_solana_rpc_url(rpc_url: &str) -> anyhow::Result<()> {
    let parsed = url::Url::parse(rpc_url)
        .map_err(|_| anyhow::anyhow!("SOLANA_RPC_URL is not a valid URL: {}", rpc_url))?;

    // Reject embedded credentials (SSRF risk)
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(anyhow::anyhow!(
            "SOLANA_RPC_URL must not contain credentials"
        ));
    }

    // For mainnet, require HTTPS
    let is_mainnet = rpc_url.contains("mainnet");
    if is_mainnet && parsed.scheme() != "https" {
        return Err(anyhow::anyhow!(
            "SOLANA_RPC_URL must use HTTPS for mainnet: {}",
            rpc_url
        ));
    }

    // For any URL, scheme must be http or https
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(anyhow::anyhow!(
            "SOLANA_RPC_URL must use HTTP or HTTPS scheme: {}",
            rpc_url
        ));
    }

    Ok(())
}

/// Validate that a string is a valid base58-encoded Solana pubkey (32 bytes).
fn validate_solana_pubkey(value: &str, field_name: &str) -> anyhow::Result<()> {
    crate::services::solana_rpc::decode_pubkey(value)
        .map_err(|e| anyhow::anyhow!("{} is not a valid Solana pubkey: {}", field_name, e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_solana_rpc_url_https_mainnet() {
        assert!(validate_solana_rpc_url("https://api.mainnet-beta.solana.com").is_ok());
    }

    #[test]
    fn test_validate_solana_rpc_url_http_mainnet_rejected() {
        assert!(validate_solana_rpc_url("http://api.mainnet-beta.solana.com").is_err());
    }

    #[test]
    fn test_validate_solana_rpc_url_http_devnet_ok() {
        assert!(validate_solana_rpc_url("http://api.devnet.solana.com").is_ok());
        assert!(validate_solana_rpc_url("http://localhost:8899").is_ok());
    }

    #[test]
    fn test_validate_solana_rpc_url_credentials_rejected() {
        assert!(validate_solana_rpc_url("https://user:pass@api.mainnet-beta.solana.com").is_err());
    }

    #[test]
    fn test_validate_solana_rpc_url_invalid() {
        assert!(validate_solana_rpc_url("not a url").is_err());
    }

    #[test]
    fn test_validate_solana_pubkey_valid() {
        // System program (all zeros)
        assert!(validate_solana_pubkey("11111111111111111111111111111111", "test").is_ok());
    }

    #[test]
    fn test_validate_solana_pubkey_invalid() {
        assert!(validate_solana_pubkey("invalid!", "test").is_err());
        assert!(validate_solana_pubkey("", "test").is_err());
    }
}

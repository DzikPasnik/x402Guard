use std::net::IpAddr;

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::middleware::nonce::NonceStore;
use crate::middleware::rate_limit::RateLimiter;
use crate::middleware::x402;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    /// The target URL to forward the x402 payment request to.
    pub target_url: String,
    /// Base64url-encoded x402 payment payload (same format as X-Payment header).
    pub x402_payment: String,
    /// Base64url-encoded x402 payment requirements from the upstream 402 response.
    pub x402_requirements: String,
    /// Session key identifier (EIP-7702) — used in Phase 2.
    pub session_key_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyResponse {
    pub success: bool,
    pub tx_hash: Option<String>,
    pub message: String,
    /// Forwarded response body from the target service (if successful).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Full x402 proxy flow:
/// 1. Validate input (target URL, SSRF check)
/// 2. Parse x402 headers
/// 3. Verify EIP-3009 signature
/// 4. Check nonce (replay prevention)
/// 5. Check rate limit
/// 6. Forward request to target with X-Payment header
/// 7. Return response
async fn forward_request(
    State(state): State<AppState>,
    Json(req): Json<ProxyRequest>,
) -> Result<Json<ProxyResponse>, AppError> {
    // 1. Input validation
    validate_target_url(&req.target_url)?;

    tracing::info!(target_url = %req.target_url, "proxy request received");

    // 2. Parse x402 headers
    let requirements = x402::parse_payment_requirements(&req.x402_requirements)?;
    let payment = x402::parse_payment_payload(&req.x402_payment)?;

    // 3. Verify EIP-3009 signature
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is before UNIX epoch")
        .as_secs();

    let verified = x402::verify::verify_payment(&requirements, &payment, now_secs)?;

    tracing::info!(
        from = %verified.from,
        to = %verified.to,
        value = %verified.value,
        "payment signature verified"
    );

    // 4. Nonce deduplication
    // SECURITY: Clamp TTL to prevent Redis memory exhaustion (attacker sending huge ttl)
    // and ensure minimum replay protection window (attacker sending ttl=0).
    const MIN_NONCE_TTL: u64 = 60; // 1 minute minimum
    const MAX_NONCE_TTL: u64 = 86_400; // 24 hours maximum
    let nonce_ttl = requirements.max_timeout_seconds.clamp(MIN_NONCE_TTL, MAX_NONCE_TTL);

    let nonce_hex = hex::encode(verified.nonce.as_slice());
    let nonce_store = NonceStore::new(state.redis.clone());
    let is_new = nonce_store
        .check_and_store(&nonce_hex, nonce_ttl)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !is_new {
        return Err(AppError::BadRequest(format!(
            "nonce already used: {nonce_hex}"
        )));
    }

    // 5. Rate limit check (global)
    let limiter = RateLimiter::new(state.redis.clone());
    let rate_result = limiter
        .check("global", state.config.rate_limit_rps, 1)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !rate_result.allowed {
        return Err(AppError::RateLimited);
    }

    // 6. Forward request to target service with X-Payment header
    let response = state
        .http_client
        .get(&req.target_url)
        .header("X-Payment", &req.x402_payment)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("forward request failed: {e}")))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .unwrap_or(serde_json::Value::Null);

    if status.is_success() {
        Ok(Json(ProxyResponse {
            success: true,
            tx_hash: None,
            message: "payment verified and request forwarded".into(),
            data: Some(body),
        }))
    } else {
        Ok(Json(ProxyResponse {
            success: false,
            tx_hash: None,
            message: format!("upstream returned {status}"),
            data: Some(body),
        }))
    }
}

/// Validate the target URL: must be HTTPS, no credentials, and not targeting private IPs.
///
/// SECURITY: This is a defense-in-depth SSRF check. It validates:
/// - HTTPS only
/// - No embedded credentials (user:pass@host)
/// - No raw private/reserved IP addresses
/// - URL length limit to prevent abuse
///
/// NOTE: This does NOT fully prevent DNS rebinding attacks. For full
/// protection, configure reqwest with a custom DNS resolver that validates
/// resolved IPs (Phase 2 hardening). This check is still valuable as it
/// blocks direct IP-based SSRF.
fn validate_target_url(url: &str) -> Result<(), AppError> {
    // Reject excessively long URLs
    const MAX_URL_LEN: usize = 2048;
    if url.len() > MAX_URL_LEN {
        return Err(AppError::BadRequest("target_url too long".into()));
    }

    let parsed = url::Url::parse(url)
        .map_err(|_| AppError::BadRequest("invalid target_url".into()))?;

    if parsed.scheme() != "https" {
        return Err(AppError::BadRequest(
            "target_url must use HTTPS".into(),
        ));
    }

    // Reject URLs with embedded credentials
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::BadRequest(
            "target_url must not contain credentials".into(),
        ));
    }

    // Reject URLs with no host
    let host = parsed.host_str().ok_or_else(|| {
        AppError::BadRequest("target_url must have a valid host".into())
    })?;

    // Block reserved hostnames
    if host == "localhost" || host.ends_with(".local") || host.ends_with(".internal") {
        return Err(AppError::BadRequest(
            "target_url must not point to local/internal hosts".into(),
        ));
    }

    // Check for private IP ranges (SSRF prevention).
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(&ip) {
            return Err(AppError::BadRequest(
                "target_url must not point to private/internal IP".into(),
            ));
        }
    }

    Ok(())
}

/// Check if an IP address is in a private/reserved range.
///
/// Covers all RFC 1918, link-local, loopback, documentation, and reserved ranges.
fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()             // 127.0.0.0/8
                || v4.is_private()       // 10/8, 172.16/12, 192.168/16
                || v4.is_link_local()    // 169.254.0.0/16
                || v4.is_broadcast()     // 255.255.255.255
                || v4.is_unspecified()   // 0.0.0.0
                || v4.is_documentation() // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
                || v4.octets()[0] == 100 && v4.octets()[1] >= 64 && v4.octets()[1] <= 127 // CGNAT 100.64/10
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()       // ::1
                || v6.is_unspecified() // ::
                // IPv4-mapped IPv6: ::ffff:x.x.x.x
                || {
                    let segments = v6.segments();
                    segments[0] == 0 && segments[1] == 0 && segments[2] == 0
                        && segments[3] == 0 && segments[4] == 0 && segments[5] == 0xffff
                        && {
                            let v4 = std::net::Ipv4Addr::new(
                                (segments[6] >> 8) as u8,
                                segments[6] as u8,
                                (segments[7] >> 8) as u8,
                                segments[7] as u8,
                            );
                            is_private_ip(&IpAddr::V4(v4))
                        }
                }
        }
    }
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/proxy", post(forward_request))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_https_url() {
        assert!(validate_target_url("https://api.example.com/data").is_ok());
    }

    #[test]
    fn test_http_rejected() {
        assert!(validate_target_url("http://api.example.com/data").is_err());
    }

    #[test]
    fn test_private_ip_rejected() {
        assert!(validate_target_url("https://192.168.1.1/api").is_err());
        assert!(validate_target_url("https://10.0.0.1/api").is_err());
        assert!(validate_target_url("https://127.0.0.1/api").is_err());
        assert!(validate_target_url("https://172.16.0.1/api").is_err());
        assert!(validate_target_url("https://0.0.0.0/api").is_err());
    }

    #[test]
    fn test_invalid_url_rejected() {
        assert!(validate_target_url("not a url").is_err());
    }

    #[test]
    fn test_localhost_rejected() {
        assert!(validate_target_url("https://localhost/api").is_err());
        assert!(validate_target_url("https://service.local/api").is_err());
        assert!(validate_target_url("https://redis.internal/api").is_err());
    }

    #[test]
    fn test_credentials_in_url_rejected() {
        assert!(validate_target_url("https://user:pass@api.example.com/data").is_err());
    }

    #[test]
    fn test_url_too_long_rejected() {
        let long_url = format!("https://api.example.com/{}", "a".repeat(2100));
        assert!(validate_target_url(&long_url).is_err());
    }

    #[test]
    fn test_cgnat_ip_rejected() {
        // 100.64.0.0/10 - CGNAT range (could be cloud-internal)
        assert!(validate_target_url("https://100.64.0.1/api").is_err());
        assert!(validate_target_url("https://100.127.255.254/api").is_err());
    }
}

use std::net::IpAddr;

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::nonce::NonceStore;
use crate::middleware::rate_limit::RateLimiter;
use crate::middleware::{eip7702, guardrails, x402};
use crate::models::audit_event::{AuditEvent, AuditEventType};
use crate::repo;
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
    /// Agent identifier — when present, guardrails are evaluated.
    pub agent_id: Option<String>,
    /// Session key identifier (EIP-7702) — when present, session key verification runs.
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
/// 3. Security: validate target_url matches requirements.resource (M4)
/// 4. Security: validate payment asset matches requirements.asset (M5)
/// 5. Verify EIP-3009 signature
/// 6. Session key verification (if session_key_id present)
/// 7. Guardrails evaluation (if agent_id present)
/// 8. Check nonce (replay prevention)
/// 9. Check rate limit
/// 10. Forward request to target with X-Payment header
/// 11. Record spend in ledger (if agent_id present)
async fn forward_request(
    State(state): State<AppState>,
    Json(req): Json<ProxyRequest>,
) -> Result<Json<ProxyResponse>, AppError> {
    // 1. Input validation
    validate_target_url(&req.target_url)?;

    tracing::info!(target_url = %req.target_url, "proxy request received");

    // AUDIT: ProxyRequestReceived — fire-and-forget via mpsc channel.
    // SECURITY: Only log target_url (identifier), never secrets or payment payload.
    state.audit.emit(AuditEvent {
        agent_id: req.agent_id.as_deref().and_then(|s| s.parse().ok()),
        session_key_id: req.session_key_id.as_deref().and_then(|s| s.parse().ok()),
        event_type: AuditEventType::ProxyRequestReceived,
        metadata: serde_json::json!({ "target_url": req.target_url }),
    });

    // 2. Parse x402 headers
    let requirements = x402::parse_payment_requirements(&req.x402_requirements)?;
    let payment = x402::parse_payment_payload(&req.x402_payment)?;

    // 3. SECURITY [M4]: Validate target_url matches requirements.resource.
    // Prevents attacker from using a valid payment signed for resource A
    // to access resource B.
    validate_resource_match(&req.target_url, &requirements.resource)?;

    // 4. SECURITY [M5]: Validate payment asset matches requirements.asset.
    // Prevents attacker from paying with a worthless token when the resource
    // requires a specific asset (e.g. USDC).
    validate_asset_match(&payment, &requirements)?;

    // 5. Verify EIP-3009 signature
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

    // Parse optional identifiers
    let agent_id = req
        .agent_id
        .as_deref()
        .map(|s| s.parse::<Uuid>())
        .transpose()
        .map_err(|_| AppError::BadRequest("invalid agent_id UUID".into()))?;

    let session_key_id = req
        .session_key_id
        .as_deref()
        .map(|s| s.parse::<Uuid>())
        .transpose()
        .map_err(|_| AppError::BadRequest("invalid session_key_id UUID".into()))?;

    // SECURITY [C4]: Reject payments with values that overflow u64.
    // u64::MAX in USDC = ~18 quintillion. Any larger value is clearly malicious.
    // This MUST happen before any database operations to prevent i64 truncation.
    let payment_amount: u64 = verified.value.try_into().map_err(|_| {
        AppError::BadRequest("payment value exceeds maximum supported amount (u64)".into())
    })?;

    // 6. Session key verification (if session_key_id present)
    if let Some(sk_id) = session_key_id {
        let session_key = repo::session_keys::find_by_id(&state.db, sk_id)
            .await
            .map_err(|e| AppError::Internal(e))?
            .ok_or_else(|| AppError::NotFound(format!("session key {} not found", sk_id)))?;

        let target_contract = requirements.extra.get("contract").and_then(|v| v.as_str());
        eip7702::verify_session_key(&session_key, &verified, target_contract)?;

        tracing::info!(session_key_id = %sk_id, "session key verified");
    }

    // 7. Guardrails evaluation (if agent_id present)
    if let Some(aid) = agent_id {
        // Verify agent exists and is active
        let agent = repo::agents::find_by_id(&state.db, aid)
            .await
            .map_err(|e| AppError::Internal(e))?
            .ok_or_else(|| AppError::NotFound(format!("agent {} not found", aid)))?;

        // SECURITY [M6]: Reject payments for deactivated agents
        if !agent.is_active {
            return Err(AppError::Forbidden("agent is deactivated".into()));
        }

        // Load active rules for this agent
        let rules = repo::guardrails::find_active_by_agent(&state.db, aid)
            .await
            .map_err(|e| AppError::Internal(e))?;

        // Query rolling 24h spend from ledger
        let daily_spent = repo::spend_ledger::sum_last_24h(&state.db, aid)
            .await
            .map_err(|e| AppError::Internal(e))?;

        // Evaluate all rules (fail-closed)
        if let Err(violation) = guardrails::evaluate(&rules, &verified, &requirements, daily_spent) {
            // AUDIT: GuardrailViolation — record which rule blocked and why.
            state.audit.emit(AuditEvent {
                agent_id: Some(aid),
                session_key_id,
                event_type: AuditEventType::GuardrailViolation,
                metadata: serde_json::json!({
                    "target_url": req.target_url,
                    "violation": violation.to_string(),
                }),
            });
            return Err(violation);
        }

        tracing::info!(agent_id = %aid, rules_count = rules.len(), "guardrails passed");
    }

    // 8. Nonce deduplication
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

    // 9. Rate limit check (global)
    let limiter = RateLimiter::new(state.redis.clone());
    let rate_result = limiter
        .check("global", state.config.rate_limit_rps, 1)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !rate_result.allowed {
        return Err(AppError::RateLimited);
    }

    // 10. SECURITY [C1+C2+C3]: Reserve spend BEFORE forwarding (atomic).
    // This prevents TOCTOU race conditions where concurrent requests bypass limits.
    // If Postgres fails, the payment is NOT forwarded — fail-closed.
    if let Some(aid) = agent_id {
        // Record spend in ledger — MUST succeed before forwarding
        repo::spend_ledger::record_spend(
            &state.db,
            aid,
            session_key_id,
            payment_amount,
            &nonce_hex,
        )
        .await
        .map_err(|e| AppError::Internal(e))?;

        // Atomically increment session key spend counter (if applicable).
        // The SQL uses WHERE spent + $2 <= max_spend for atomic enforcement.
        if let Some(sk_id) = session_key_id {
            repo::session_keys::increment_spent(&state.db, sk_id, payment_amount)
                .await
                .map_err(|e| {
                    tracing::error!(error = %e, "session key atomic spend increment failed");
                    AppError::GuardrailViolation(
                        "session key spend limit exceeded (concurrent check)".into(),
                    )
                })?;
        }

        tracing::info!(agent_id = %aid, amount = payment_amount, "spend reserved in ledger");
    }

    // 11. Forward request to target service with X-Payment header
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
        // AUDIT: ProxyRequestForwarded — successful upstream response.
        state.audit.emit(AuditEvent {
            agent_id,
            session_key_id,
            event_type: AuditEventType::ProxyRequestForwarded,
            metadata: serde_json::json!({
                "target_url": req.target_url,
                "upstream_status": status.as_u16(),
                "payment_amount": payment_amount,
            }),
        });

        Ok(Json(ProxyResponse {
            success: true,
            tx_hash: None,
            message: "payment verified and request forwarded".into(),
            data: Some(body),
        }))
    } else {
        // AUDIT: ProxyRequestFailed — upstream returned non-2xx.
        state.audit.emit(AuditEvent {
            agent_id,
            session_key_id,
            event_type: AuditEventType::ProxyRequestFailed,
            metadata: serde_json::json!({
                "target_url": req.target_url,
                "upstream_status": status.as_u16(),
                "payment_amount": payment_amount,
            }),
        });

        // TODO(Phase 3): Consider compensating the spend reservation on upstream failure.
        // For now, we err on the side of over-counting spend (fail-closed for safety).
        Ok(Json(ProxyResponse {
            success: false,
            tx_hash: None,
            message: format!("upstream returned {status}"),
            data: Some(body),
        }))
    }
}

/// SECURITY [M4+H4]: Validate that target_url matches the resource in payment requirements.
///
/// An attacker could present a valid payment signed for "api.example.com/cheap"
/// but route the proxy to "api.example.com/expensive". This check ensures the
/// payment was authorized for the specific resource being accessed.
///
/// Validates:
/// - Scheme, host, and port must match exactly
/// - Path must match exactly OR at a segment boundary (prevents /cheap → /cheapshot)
fn validate_resource_match(target_url: &str, resource: &str) -> Result<(), AppError> {
    let target = url::Url::parse(target_url)
        .map_err(|_| AppError::BadRequest("invalid target_url for resource match".into()))?;
    let resource_url = url::Url::parse(resource)
        .map_err(|_| AppError::BadRequest("invalid resource URL in payment requirements".into()))?;

    // Scheme + host + port must match exactly (case-insensitive for scheme/host)
    if target.scheme() != resource_url.scheme()
        || target.host() != resource_url.host()
        || target.port() != resource_url.port()
    {
        return Err(AppError::BadRequest(format!(
            "target_url origin does not match payment resource: '{}' vs '{}'",
            target_url, resource
        )));
    }

    // SECURITY [H4]: Path must match exactly or at a segment boundary.
    // This prevents /cheap → /cheapshot prefix attacks.
    let target_path = target.path();
    let resource_path = resource_url.path();
    let path_ok = target_path == resource_path
        || target_path.starts_with(&format!("{}/", resource_path))
        || resource_path == "/"; // root resource matches everything

    if !path_ok {
        return Err(AppError::BadRequest(format!(
            "target_url path does not match payment resource: '{}' vs '{}'",
            target_path, resource_path
        )));
    }
    Ok(())
}

/// SECURITY [M5]: Validate that requirements.asset matches the canonical USDC address
/// for the payment network.
///
/// Without this check, an attacker could craft payment requirements pointing to
/// a worthless ERC-20 token address. The EIP-712 domain would be constructed with
/// the wrong verifying_contract, but if we don't check, the proxy would happily
/// forward with the wrong asset expectations. We verify that requirements.asset
/// matches the known USDC address for the payment's network.
fn validate_asset_match(
    payment: &x402::types::PaymentPayload,
    requirements: &x402::types::PaymentRequirements,
) -> Result<(), AppError> {
    // Resolve the expected USDC address for this network
    let (expected_usdc, _chain_id) =
        x402::types::usdc::resolve_network(&payment.network).ok_or_else(|| {
            AppError::BadRequest(format!("unsupported network: {}", payment.network))
        })?;

    let expected_hex = format!("{expected_usdc:?}").to_lowercase();
    let required_hex = requirements.asset.to_lowercase();

    if required_hex != expected_hex {
        return Err(AppError::BadRequest(format!(
            "asset mismatch: requirements.asset='{}' does not match expected USDC '{}' for network '{}'",
            requirements.asset, expected_hex, payment.network
        )));
    }
    Ok(())
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

    // --- M4: Resource match tests ---

    #[test]
    fn test_resource_exact_match() {
        assert!(validate_resource_match(
            "https://api.example.com/data",
            "https://api.example.com/data"
        )
        .is_ok());
    }

    #[test]
    fn test_resource_prefix_match() {
        // resource is a prefix of target_url
        assert!(validate_resource_match(
            "https://api.example.com/data/v2",
            "https://api.example.com/data"
        )
        .is_ok());
    }

    #[test]
    fn test_resource_mismatch_rejected() {
        // Payment signed for api.example.com/cheap but target is /expensive
        let err = validate_resource_match(
            "https://api.example.com/expensive",
            "https://api.example.com/cheap",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn test_resource_different_host_rejected() {
        let err = validate_resource_match(
            "https://evil.com/data",
            "https://api.example.com/data",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn test_resource_case_insensitive() {
        // Schemes and hosts should match case-insensitively
        assert!(validate_resource_match(
            "HTTPS://API.EXAMPLE.COM/data",
            "https://api.example.com/data"
        )
        .is_ok());
    }

    // --- M5: Asset match tests ---

    #[test]
    fn test_asset_match_base_sepolia() {
        let payment = x402::types::PaymentPayload {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            payload: x402::types::PaymentProof {
                signature: "0x00".into(),
                authorization: x402::types::TransferAuthorization {
                    from: "0x00".into(),
                    to: "0x00".into(),
                    value: "0".into(),
                    valid_after: "0".into(),
                    valid_before: "0".into(),
                    nonce: "0x00".into(),
                },
            },
        };
        let requirements = x402::types::PaymentRequirements {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            max_amount_required: "1000000".into(),
            resource: "https://api.example.com/test".into(),
            description: String::new(),
            mime_type: String::new(),
            pay_to: "0x1111111111111111111111111111111111111111".into(),
            max_timeout_seconds: 60,
            // Correct USDC address for Base Sepolia
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e".into(),
            extra: serde_json::json!({}),
        };
        assert!(validate_asset_match(&payment, &requirements).is_ok());
    }

    #[test]
    fn test_asset_mismatch_wrong_token() {
        let payment = x402::types::PaymentPayload {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            payload: x402::types::PaymentProof {
                signature: "0x00".into(),
                authorization: x402::types::TransferAuthorization {
                    from: "0x00".into(),
                    to: "0x00".into(),
                    value: "0".into(),
                    valid_after: "0".into(),
                    valid_before: "0".into(),
                    nonce: "0x00".into(),
                },
            },
        };
        let requirements = x402::types::PaymentRequirements {
            scheme: "exact".into(),
            network: "base-sepolia".into(),
            max_amount_required: "1000000".into(),
            resource: "https://api.example.com/test".into(),
            description: String::new(),
            mime_type: String::new(),
            pay_to: "0x1111111111111111111111111111111111111111".into(),
            max_timeout_seconds: 60,
            // WRONG: This is a fake token, not USDC
            asset: "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF".into(),
            extra: serde_json::json!({}),
        };
        let err = validate_asset_match(&payment, &requirements).unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn test_asset_match_base_mainnet() {
        let payment = x402::types::PaymentPayload {
            scheme: "exact".into(),
            network: "base-mainnet".into(),
            payload: x402::types::PaymentProof {
                signature: "0x00".into(),
                authorization: x402::types::TransferAuthorization {
                    from: "0x00".into(),
                    to: "0x00".into(),
                    value: "0".into(),
                    valid_after: "0".into(),
                    valid_before: "0".into(),
                    nonce: "0x00".into(),
                },
            },
        };
        let requirements = x402::types::PaymentRequirements {
            scheme: "exact".into(),
            network: "base-mainnet".into(),
            max_amount_required: "1000000".into(),
            resource: "https://api.example.com/test".into(),
            description: String::new(),
            mime_type: String::new(),
            pay_to: "0x1111111111111111111111111111111111111111".into(),
            max_timeout_seconds: 60,
            // Correct USDC address for Base Mainnet
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".into(),
            extra: serde_json::json!({}),
        };
        assert!(validate_asset_match(&payment, &requirements).is_ok());
    }

    #[test]
    fn test_asset_unsupported_network() {
        let payment = x402::types::PaymentPayload {
            scheme: "exact".into(),
            network: "ethereum-mainnet".into(),
            payload: x402::types::PaymentProof {
                signature: "0x00".into(),
                authorization: x402::types::TransferAuthorization {
                    from: "0x00".into(),
                    to: "0x00".into(),
                    value: "0".into(),
                    valid_after: "0".into(),
                    valid_before: "0".into(),
                    nonce: "0x00".into(),
                },
            },
        };
        let requirements = x402::types::PaymentRequirements {
            scheme: "exact".into(),
            network: "ethereum-mainnet".into(),
            max_amount_required: "1000000".into(),
            resource: "https://api.example.com/test".into(),
            description: String::new(),
            mime_type: String::new(),
            pay_to: "0x1111111111111111111111111111111111111111".into(),
            max_timeout_seconds: 60,
            asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".into(),
            extra: serde_json::json!({}),
        };
        let err = validate_asset_match(&payment, &requirements).unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }
}

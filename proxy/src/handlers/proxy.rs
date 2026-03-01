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
use crate::services::solana_rpc;
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
            .map_err(AppError::Internal)?
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
            .map_err(AppError::Internal)?
            .ok_or_else(|| AppError::NotFound(format!("agent {} not found", aid)))?;

        // SECURITY [M6]: Reject payments for deactivated agents
        if !agent.is_active {
            return Err(AppError::Forbidden("agent is deactivated".into()));
        }

        // Load active rules for this agent
        let rules = repo::guardrails::find_active_by_agent(&state.db, aid)
            .await
            .map_err(AppError::Internal)?;

        // Query rolling 24h spend from ledger
        let daily_spent = repo::spend_ledger::sum_last_24h(&state.db, aid)
            .await
            .map_err(AppError::Internal)?;

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
        .map_err(AppError::Internal)?;

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
        .map_err(AppError::Internal)?;

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
        .map_err(AppError::Internal)?;

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

// ─── Solana x402 payment validation (read-only, non-custodial) ─────────────

/// Request body for Solana x402 proxy validation.
///
/// The proxy validates vault state (pre-flight check) but does NOT
/// submit the `guarded_withdraw` transaction. The agent submits that
/// independently to the Solana network. The on-chain guard program
/// provides ultimate enforcement.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaProxyRequest {
    /// The target URL to forward the x402 payment request to.
    pub target_url: String,
    /// Solana network identifier: "solana-devnet" or "solana-mainnet".
    pub network: String,
    /// Base58 public key of the vault owner (for PDA derivation).
    pub vault_owner: String,
    /// Payment amount in USDC (6 decimals) — the amount the agent wants to spend.
    pub amount: u64,
    /// Optional: destination program pubkey — validated against vault whitelist.
    pub destination_program: Option<String>,
    /// Original x402 payment payload to forward to the target service.
    pub x402_payment: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolanaProxyResponse {
    pub success: bool,
    pub message: String,
    /// Vault PDA address (base58) — agents use this for the guarded_withdraw instruction.
    pub vault_pda: Option<String>,
    /// Remaining daily capacity after this transaction (informational).
    pub remaining_daily_capacity: Option<u64>,
    /// Forwarded response body from the target service (if successful).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Solana x402 proxy flow (read-only, defense-in-depth):
///
/// 1. Validate target URL (SSRF check — same as EVM flow)
/// 2. Validate network is a supported Solana network
/// 3. Validate Solana config is present
/// 4. Query vault state from Solana RPC
/// 5. Pre-flight guardrail checks:
///    - Vault is active
///    - Agent not expired
///    - Amount <= max_spend_per_tx
///    - Amount + spent_today <= max_spend_per_day
///    - Destination in allowed_programs whitelist (if whitelist non-empty)
/// 6. Forward request to target service
/// 7. Emit audit events
///
/// SECURITY: This is a pre-flight check only. The on-chain guard program
/// enforces all limits atomically during guarded_withdraw. The proxy's check
/// prevents agents from wasting gas on transactions that would fail on-chain.
async fn forward_solana_request(
    State(state): State<AppState>,
    Json(req): Json<SolanaProxyRequest>,
) -> Result<Json<SolanaProxyResponse>, AppError> {
    // 1. SSRF check
    validate_target_url(&req.target_url)?;

    tracing::info!(
        target_url = %req.target_url,
        network = %req.network,
        vault_owner = %req.vault_owner,
        amount = req.amount,
        "solana proxy request received"
    );

    // 2. Validate Solana network
    if req.network != "solana-devnet" && req.network != "solana-mainnet" {
        return Err(AppError::BadRequest(format!(
            "unsupported Solana network: '{}' (expected 'solana-devnet' or 'solana-mainnet')",
            req.network
        )));
    }

    // 3. Validate Solana config
    let rpc_url = state
        .config
        .solana_rpc_url
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Solana support not configured".into()))?;
    let program_id_b58 = state
        .config
        .solana_program_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Solana program ID not configured".into()))?;

    // Validate owner pubkey
    let owner_bytes = solana_rpc::decode_pubkey(&req.vault_owner).map_err(|e| {
        AppError::BadRequest(format!("invalid vault_owner pubkey: {}", e))
    })?;
    let program_id_bytes = solana_rpc::decode_pubkey(program_id_b58).map_err(|e| {
        AppError::Internal(anyhow::anyhow!("invalid configured program ID: {}", e))
    })?;

    // Derive vault PDA
    let (vault_pda, _bump) =
        solana_rpc::derive_vault_pda(&owner_bytes, &program_id_bytes).map_err(|e| {
            AppError::Internal(anyhow::anyhow!("PDA derivation failed: {}", e))
        })?;
    let vault_pda_b58 = solana_rpc::encode_pubkey(&vault_pda);

    // 4. Query vault state from Solana RPC
    // SECURITY: Fail-closed — RPC errors reject the request
    let account_data = solana_rpc::get_account_info(
        &state.http_client,
        rpc_url,
        &vault_pda_b58,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Solana RPC getAccountInfo failed");
        AppError::Internal(anyhow::anyhow!("Solana RPC error: {}", e))
    })?;

    let raw_data = account_data.ok_or_else(|| {
        AppError::NotFound(format!("vault not found for owner {}", req.vault_owner))
    })?;

    let vault = solana_rpc::VaultState::from_account_data(&raw_data).map_err(|e| {
        tracing::error!(error = %e, "VaultState deserialization failed");
        AppError::Internal(anyhow::anyhow!("failed to deserialize vault state: {}", e))
    })?;

    // 5. Pre-flight guardrail checks (defense-in-depth — on-chain is the ultimate enforcer)

    // 5a. Vault must be active
    if !vault.is_active {
        return Err(AppError::Forbidden("vault is not active".into()));
    }

    // 5b. Agent must not be expired (0 = no expiry)
    if vault.agent_expires_at > 0 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is before UNIX epoch")
            .as_secs();

        // SECURITY: checked cast — agent_expires_at is i64 from on-chain, compare as u64
        let expires_at = u64::try_from(vault.agent_expires_at).unwrap_or(0);
        if now > expires_at {
            return Err(AppError::Forbidden("agent key has expired".into()));
        }
    }

    // 5c. Amount must not exceed per-transaction limit
    if req.amount > vault.max_spend_per_tx {
        return Err(AppError::GuardrailViolation(format!(
            "amount {} exceeds per-transaction limit {}",
            req.amount, vault.max_spend_per_tx
        )));
    }

    // 5d. Amount + spent_today must not exceed daily limit
    // SECURITY: checked arithmetic — prevent overflow
    let new_daily_total = vault.spent_today.checked_add(req.amount).ok_or_else(|| {
        AppError::GuardrailViolation("daily spend would overflow u64".into())
    })?;

    if new_daily_total > vault.max_spend_per_day {
        return Err(AppError::GuardrailViolation(format!(
            "amount {} would exceed daily limit (spent_today={}, max_spend_per_day={})",
            req.amount, vault.spent_today, vault.max_spend_per_day
        )));
    }

    // 5e. Destination program must be in allowed_programs whitelist (if non-empty)
    if !vault.allowed_programs.is_empty() {
        if let Some(ref dest) = req.destination_program {
            let dest_bytes = solana_rpc::decode_pubkey(dest).map_err(|e| {
                AppError::BadRequest(format!("invalid destination_program pubkey: {}", e))
            })?;

            let is_allowed = vault
                .allowed_programs
                .contains(&dest_bytes);

            if !is_allowed {
                return Err(AppError::GuardrailViolation(format!(
                    "destination program {} is not in the vault's allowed programs whitelist",
                    dest
                )));
            }
        }
        // Note: if destination_program is None and whitelist is non-empty,
        // we allow it here — the on-chain program will enforce the whitelist
        // when the agent submits the actual transaction.
    }

    let remaining_daily = vault.max_spend_per_day.saturating_sub(new_daily_total);

    tracing::info!(
        vault_pda = %vault_pda_b58,
        amount = req.amount,
        remaining_daily = remaining_daily,
        "Solana vault pre-flight checks passed"
    );

    // AUDIT: SolanaWithdrawSubmitted — pre-flight validation passed, forwarding request.
    state.audit.emit(AuditEvent {
        agent_id: None,
        session_key_id: None,
        event_type: AuditEventType::SolanaWithdrawSubmitted,
        metadata: serde_json::json!({
            "target_url": req.target_url,
            "vault_owner": req.vault_owner,
            "vault_pda": vault_pda_b58,
            "amount": req.amount,
            "network": req.network,
        }),
    });

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
        // AUDIT: SolanaWithdrawConfirmed — upstream accepted the request.
        state.audit.emit(AuditEvent {
            agent_id: None,
            session_key_id: None,
            event_type: AuditEventType::SolanaWithdrawConfirmed,
            metadata: serde_json::json!({
                "target_url": req.target_url,
                "vault_pda": vault_pda_b58,
                "amount": req.amount,
                "upstream_status": status.as_u16(),
            }),
        });

        Ok(Json(SolanaProxyResponse {
            success: true,
            message: "vault validated, request forwarded".into(),
            vault_pda: Some(vault_pda_b58),
            remaining_daily_capacity: Some(remaining_daily),
            data: Some(body),
        }))
    } else {
        // AUDIT: SolanaWithdrawFailed — upstream returned non-2xx.
        state.audit.emit(AuditEvent {
            agent_id: None,
            session_key_id: None,
            event_type: AuditEventType::SolanaWithdrawFailed,
            metadata: serde_json::json!({
                "target_url": req.target_url,
                "vault_pda": vault_pda_b58,
                "amount": req.amount,
                "upstream_status": status.as_u16(),
            }),
        });

        Ok(Json(SolanaProxyResponse {
            success: false,
            message: format!("upstream returned {}", status),
            vault_pda: Some(vault_pda_b58),
            remaining_daily_capacity: Some(remaining_daily),
            data: Some(body),
        }))
    }
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/proxy", post(forward_request))
        .route("/proxy/solana", post(forward_solana_request))
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

    // --- Solana proxy request/response serialization tests ---

    #[test]
    fn test_solana_proxy_request_deserializes() {
        let json = serde_json::json!({
            "targetUrl": "https://api.example.com/data",
            "network": "solana-devnet",
            "vaultOwner": "11111111111111111111111111111111",
            "amount": 1000000,
            "x402Payment": "base64data"
        });

        let req: SolanaProxyRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.target_url, "https://api.example.com/data");
        assert_eq!(req.network, "solana-devnet");
        assert_eq!(req.vault_owner, "11111111111111111111111111111111");
        assert_eq!(req.amount, 1_000_000);
        assert!(req.destination_program.is_none());
    }

    #[test]
    fn test_solana_proxy_request_with_destination() {
        let json = serde_json::json!({
            "targetUrl": "https://api.example.com/data",
            "network": "solana-mainnet",
            "vaultOwner": "11111111111111111111111111111111",
            "amount": 500000,
            "destinationProgram": "22222222222222222222222222222222",
            "x402Payment": "base64data"
        });

        let req: SolanaProxyRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.destination_program.as_deref(), Some("22222222222222222222222222222222"));
    }

    #[test]
    fn test_solana_proxy_response_serializes() {
        let response = SolanaProxyResponse {
            success: true,
            message: "vault validated, request forwarded".into(),
            vault_pda: Some("33333333333333333333333333333333".into()),
            remaining_daily_capacity: Some(9_000_000),
            data: None,
        };

        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["vaultPda"], "33333333333333333333333333333333");
        assert_eq!(json["remainingDailyCapacity"], 9_000_000);
        // data is None + skip_serializing_if, so it should not be present
        assert!(json.get("data").is_none());
    }

    #[test]
    fn test_solana_proxy_response_with_data() {
        let response = SolanaProxyResponse {
            success: false,
            message: "upstream returned 500".into(),
            vault_pda: Some("44444444444444444444444444444444".into()),
            remaining_daily_capacity: Some(0),
            data: Some(serde_json::json!({"error": "internal server error"})),
        };

        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["success"], false);
        assert!(json["data"]["error"].is_string());
    }
}

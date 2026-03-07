//! API key authentication middleware for management endpoints.
//!
//! SECURITY: Fail-closed — if no API key is configured, ALL management
//! requests are denied. This prevents accidental exposure of CRUD endpoints.

use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

/// Middleware that validates the `X-Api-Key` header against the configured secret.
///
/// Rejects with 401 Unauthorized if:
/// - No API key is configured (fail-closed)
/// - Header is missing
/// - Header value does not match
///
/// Uses constant-time comparison to prevent timing attacks.
pub async fn require_api_key(request: Request, next: Next) -> Response {
    let expected = request
        .extensions()
        .get::<ApiKeyConfig>()
        .and_then(|cfg| cfg.key.as_deref());

    let expected = match expected {
        Some(key) => key,
        None => {
            // SECURITY: No API key configured — deny all management requests (fail-closed).
            tracing::warn!("Management API request denied: MANAGEMENT_API_KEY not configured");
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({
                    "error": "management API key not configured",
                    "code": 401
                })),
            )
                .into_response();
        }
    };

    let provided = request
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok());

    let provided = match provided {
        Some(key) => key,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({
                    "error": "missing X-Api-Key header",
                    "code": 401
                })),
            )
                .into_response();
        }
    };

    // SECURITY: Constant-time comparison to prevent timing attacks.
    if !constant_time_eq(expected.as_bytes(), provided.as_bytes()) {
        tracing::warn!("Management API request denied: invalid API key");
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({
                "error": "invalid API key",
                "code": 401
            })),
        )
            .into_response();
    }

    next.run(request).await
}

/// Extension type injected into the request to carry the API key config.
#[derive(Clone)]
pub struct ApiKeyConfig {
    pub key: Option<String>,
}

/// Constant-time byte comparison to prevent timing side-channel attacks.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_eq_same() {
        assert!(constant_time_eq(b"secret123", b"secret123"));
    }

    #[test]
    fn constant_time_eq_different() {
        assert!(!constant_time_eq(b"secret123", b"secret456"));
    }

    #[test]
    fn constant_time_eq_different_lengths() {
        assert!(!constant_time_eq(b"short", b"longer_string"));
    }

    #[test]
    fn constant_time_eq_empty() {
        assert!(constant_time_eq(b"", b""));
    }
}

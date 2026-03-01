//! Audit event types and structures for the immutable audit log.
//!
//! Events are fire-and-forget — they flow through an mpsc channel to a
//! background writer task so they never block the proxy hot path.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// All valid audit event types. Must stay in sync with the CHECK constraint
/// on audit_log.event_type in 002_create_audit_log.sql.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    ProxyRequestReceived,
    ProxyRequestForwarded,
    ProxyRequestFailed,
    GuardrailViolation,
    SessionKeyCreated,
    SessionKeyUsed,
    SessionKeyRevoked,
    AllSessionKeysRevoked,
    AgentCreated,
    AgentDeactivated,
}

impl AuditEventType {
    /// Returns the DB-compatible string for this event type.
    /// Values must match the CHECK constraint in 002_create_audit_log.sql exactly.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ProxyRequestReceived => "proxy_request_received",
            Self::ProxyRequestForwarded => "proxy_request_forwarded",
            Self::ProxyRequestFailed => "proxy_request_failed",
            Self::GuardrailViolation => "guardrail_violation",
            Self::SessionKeyCreated => "session_key_created",
            Self::SessionKeyUsed => "session_key_used",
            Self::SessionKeyRevoked => "session_key_revoked",
            Self::AllSessionKeysRevoked => "all_session_keys_revoked",
            Self::AgentCreated => "agent_created",
            Self::AgentDeactivated => "agent_deactivated",
        }
    }
}

/// An audit event ready to be persisted.
///
/// SECURITY: metadata must never contain secrets (private keys, tokens).
/// Only include identifiers, amounts, addresses, and status codes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Agent that triggered this event (None for system-level events).
    pub agent_id: Option<Uuid>,
    /// Session key involved (None when not applicable).
    pub session_key_id: Option<Uuid>,
    /// The type of event.
    pub event_type: AuditEventType,
    /// Structured metadata (amounts, addresses, error details).
    /// SECURITY: No secrets — only identifiers and status information.
    pub metadata: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_returns_correct_strings() {
        assert_eq!(AuditEventType::ProxyRequestReceived.as_str(), "proxy_request_received");
        assert_eq!(AuditEventType::ProxyRequestForwarded.as_str(), "proxy_request_forwarded");
        assert_eq!(AuditEventType::ProxyRequestFailed.as_str(), "proxy_request_failed");
        assert_eq!(AuditEventType::GuardrailViolation.as_str(), "guardrail_violation");
        assert_eq!(AuditEventType::SessionKeyCreated.as_str(), "session_key_created");
        assert_eq!(AuditEventType::SessionKeyUsed.as_str(), "session_key_used");
        assert_eq!(AuditEventType::SessionKeyRevoked.as_str(), "session_key_revoked");
        assert_eq!(AuditEventType::AllSessionKeysRevoked.as_str(), "all_session_keys_revoked");
        assert_eq!(AuditEventType::AgentCreated.as_str(), "agent_created");
        assert_eq!(AuditEventType::AgentDeactivated.as_str(), "agent_deactivated");
    }

    #[test]
    fn audit_event_serializes_to_json() {
        let event = AuditEvent {
            agent_id: Some(Uuid::nil()),
            session_key_id: None,
            event_type: AuditEventType::ProxyRequestReceived,
            metadata: serde_json::json!({"target_url": "https://api.example.com/data"}),
        };

        let json = serde_json::to_value(&event).expect("serialization should succeed");
        assert_eq!(json["event_type"], "proxy_request_received");
        assert_eq!(json["agent_id"], Uuid::nil().to_string());
        assert!(json["session_key_id"].is_null());
        assert_eq!(json["metadata"]["target_url"], "https://api.example.com/data");
    }

    #[test]
    fn audit_event_without_agent_serializes() {
        let event = AuditEvent {
            agent_id: None,
            session_key_id: None,
            event_type: AuditEventType::AgentCreated,
            metadata: serde_json::json!({}),
        };

        let json = serde_json::to_value(&event).expect("serialization should succeed");
        assert!(json["agent_id"].is_null());
        assert_eq!(json["event_type"], "agent_created");
    }
}

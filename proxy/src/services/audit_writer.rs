//! Non-blocking audit event writer.
//!
//! Events are sent over an unbounded mpsc channel and persisted by a
//! background tokio task. This ensures audit writes never add latency
//! to the proxy hot path (NFR-1: p99 < 200ms).
//!
//! The channel is unbounded because:
//! - Audit events are tiny (~200 bytes each)
//! - Bounded channels would add back-pressure to the proxy handler
//! - We log warnings if the channel errors (writer crashed)

use sqlx::PgPool;
use tokio::sync::mpsc;
use tracing::{error, warn};

use crate::models::audit_event::AuditEvent;
use crate::repo;

/// Maximum number of events to drain from the channel per batch.
const MAX_BATCH_SIZE: usize = 64;

/// Non-blocking audit event writer backed by a tokio mpsc channel.
///
/// Call `emit()` from any handler — it returns immediately without waiting
/// for the database write.
#[derive(Clone)]
pub struct AuditWriter {
    tx: mpsc::UnboundedSender<AuditEvent>,
}

impl AuditWriter {
    /// Spawn the background writer loop and return a clonable handle.
    ///
    /// The writer task runs for the lifetime of the application. If it
    /// panics, `emit()` will return `false` and log a warning.
    pub fn spawn(pool: PgPool) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        tokio::spawn(writer_loop(pool, rx));
        Self { tx }
    }

    /// Fire-and-forget: enqueue an audit event for background persistence.
    ///
    /// Returns `true` if the event was accepted, `false` if the writer
    /// has crashed (channel closed). A `false` return is logged as a
    /// warning but does NOT block the request.
    pub fn emit(&self, event: AuditEvent) -> bool {
        match self.tx.send(event) {
            Ok(()) => true,
            Err(e) => {
                warn!(
                    event_type = %e.0.event_type.as_str(),
                    "audit writer channel closed — event dropped"
                );
                false
            }
        }
    }

    /// Create a no-op writer whose channel is immediately closed.
    /// Useful for tests that don't need audit persistence.
    #[cfg(test)]
    pub fn noop() -> Self {
        let (tx, _rx) = mpsc::unbounded_channel();
        // Dropping _rx closes the channel, so emit() will return false.
        Self { tx }
    }
}

/// Background loop that drains the channel and writes batches to Postgres.
///
/// Drains up to `MAX_BATCH_SIZE` events at a time for efficiency, then
/// inserts them via the repo layer. Errors are logged but never propagate
/// — audit failures must not crash the proxy.
async fn writer_loop(pool: PgPool, mut rx: mpsc::UnboundedReceiver<AuditEvent>) {
    loop {
        // Wait for the first event (blocks until available or channel closes).
        let first = match rx.recv().await {
            Some(event) => event,
            None => {
                // Channel closed — all senders dropped. Graceful shutdown.
                tracing::info!("audit writer shutting down — channel closed");
                return;
            }
        };

        // Drain up to MAX_BATCH_SIZE - 1 more events without blocking.
        let mut batch = Vec::with_capacity(MAX_BATCH_SIZE);
        batch.push(first);

        while batch.len() < MAX_BATCH_SIZE {
            match rx.try_recv() {
                Ok(event) => batch.push(event),
                Err(_) => break,
            }
        }

        let count = batch.len();

        if let Err(e) = repo::audit_log::insert_batch(&pool, &batch).await {
            error!(
                error = %e,
                batch_size = count,
                "audit writer failed to persist batch — events lost"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::audit_event::AuditEventType;

    #[test]
    fn emit_returns_true_when_channel_open() {
        // Create a channel where we hold onto the receiver so it stays open.
        let (tx, _rx) = mpsc::unbounded_channel();
        let writer = AuditWriter { tx };

        let event = AuditEvent {
            agent_id: None,
            session_key_id: None,
            event_type: AuditEventType::AgentCreated,
            metadata: serde_json::json!({}),
        };

        assert!(writer.emit(event));
    }

    #[test]
    fn emit_returns_false_when_channel_closed() {
        // Create a channel and immediately drop the receiver.
        let (tx, rx) = mpsc::unbounded_channel::<AuditEvent>();
        drop(rx);
        let writer = AuditWriter { tx };

        let event = AuditEvent {
            agent_id: None,
            session_key_id: None,
            event_type: AuditEventType::AgentCreated,
            metadata: serde_json::json!({}),
        };

        assert!(!writer.emit(event));
    }

    #[test]
    fn noop_writer_returns_false() {
        let writer = AuditWriter::noop();

        let event = AuditEvent {
            agent_id: None,
            session_key_id: None,
            event_type: AuditEventType::ProxyRequestReceived,
            metadata: serde_json::json!({}),
        };

        assert!(!writer.emit(event));
    }
}
